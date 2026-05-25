import random
import string
import time
from datetime import datetime, timedelta
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorCollection
from app.core.config import settings
from app.core.security import rate_limit
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.email import send_otp_email
from app.core.password import verify_password
from app.core.auth import create_access_token
from app.db.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ---------------------------------------------------------------------------
# OTP utilities
# ---------------------------------------------------------------------------

def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))

async def _store_otp(email: str, code: str) -> None:
    db = get_db()
    otps: AsyncIOMotorCollection = db["otps"]
    expiry = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
    await otps.insert_one({
        "email": email,
        "code": code,
        "expires_at": expiry,
        "created_at": datetime.utcnow(),
    })

async def _verify_otp(email: str, code: str) -> bool:
    db = get_db()
    otps: AsyncIOMotorCollection = db["otps"]
    doc = await otps.find_one({"email": email, "code": code})
    if not doc:
        return False
    if doc["expires_at"] < datetime.utcnow():
        return False
    # Invalidate the OTP after use
    await otps.delete_one({"_id": doc["_id"]})
    return True

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class OTPRequest(BaseModel):
    email: str

class OTPVerifyRequest(BaseModel):
    email: str
    code: str

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/otp/send", dependencies=[Depends(rate_limit(5))])
async def send_otp(req: OTPRequest):
    code = _generate_code()
    await _store_otp(req.email, code)
    success = send_otp_email(to_email=req.email, otp=code)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send OTP email")
    return {"detail": "OTP sent"}

@router.post("/otp/verify", dependencies=[Depends(rate_limit(5))])
async def verify_otp(req: OTPVerifyRequest):
    if not await _verify_otp(req.email, req.code):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    # Issue a short‑lived token that can be exchanged for a real JWT via /login
    token = create_access_token(username=req.email, role="viewer", org="kubi-org", scopes=["sre:read"])
    return {"access_token": token, "token_type": "bearer"}
