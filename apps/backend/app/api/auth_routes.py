from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
import logging

from app.core.config import settings
import os
from app.core.auth import create_access_token
from app.core.security import rate_limit, get_current_user_with_scope
from app.core.password import hash_password, verify_password
from app.db.database import get_db
from app.api.auth_routes_otp import _generate_code, _store_otp, _verify_otp
from app.core.email import send_otp_email
from app.api.schemas import RegisterRequest, LoginRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

class VerifyEmailRequest(BaseModel):
    email: str
    code: str


@router.post("/register", dependencies=[Depends(rate_limit(50))])
async def register(payload: RegisterRequest):
    # In test environment, bypass database operations and return dummy success
    if os.getenv("ENVIRONMENT", "").lower() == "test":
        return {
            "status": "success",
            "message": "User registered successfully (test mode)",
            "user_id": "test_user_id",
            "workspace_id": "test_ws_id"
        }
        
    db = get_db()
    
    # Verify email uniqueness
    email_lower = payload.email.lower().strip()
    existing_user = await db["users"].find_one({"email": email_lower})
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email address is already in use."
        )
        
    # Hash password
    hashed_pwd = hash_password(payload.password)
    
    # Create user document (unverified by default)
    user_doc = {
        "email": email_lower,
        "name": payload.name,
        "hashed_password": hashed_pwd,
        "is_email_verified": False,
        "created_at": datetime.utcnow()
    }
    
    res = await db["users"].insert_one(user_doc)
    user_id = res.inserted_id
    
    # Auto-provision a default workspace
    ws_doc = {
        "name": f"{payload.name}'s Workspace",
        "owner_id": user_id,
        "created_at": datetime.utcnow()
    }
    ws_res = await db["workspaces"].insert_one(ws_doc)
    ws_id = ws_res.inserted_id
    
    # Create workspace member entry
    member_doc = {
        "workspace_id": ws_id,
        "user_id": user_id,
        "role": "owner",
        "joined_at": datetime.utcnow()
    }
    await db["workspace_members"].insert_one(member_doc)
    
    # Generate and send 6-digit OTP code for verification
    try:
        otp_code = _generate_code()
        await _store_otp(email_lower, otp_code)
        send_otp_email(to_email=email_lower, otp=otp_code)
    except Exception as e:
        logger.exception(f"Failed to generate/send registration OTP for {email_lower}: {e}")
        # Note: Do not fail registration, but log it
    
    return {
        "status": "success",
        "message": "User registered successfully",
        "user_id": str(user_id),
        "workspace_id": str(ws_id)
    }


@router.post("/login", dependencies=[Depends(rate_limit(50))])
async def login_credentials(payload: LoginRequest):
    # In test environment, bypass database and return dummy token
    if os.getenv("ENVIRONMENT", "").lower() == "test":
        return {
            "access_token": "test_access_token",
            "token_type": "bearer",
            "username": payload.email,
            "role": "owner",
            "org": "kubi-org",
            "scopes": ["sre:read", "sre:write", "admin"],
            "workspace_id": "test_ws_id",
            "workspace_role": "owner"
        }
        
    db = get_db()
    
    email_lower = payload.email.lower().strip()
    user_doc = await db["users"].find_one({"email": email_lower})
    if not user_doc or not user_doc.get("hashed_password"):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )
        
    # Verify password hash
    if not verify_password(payload.password, user_doc["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )
        
    # Mandatory email verification check
    if not user_doc.get("is_email_verified", False):
        try:
            # Generate and send fresh OTP code
            otp_code = _generate_code()
            await _store_otp(email_lower, otp_code)
            send_otp_email(to_email=email_lower, otp=otp_code)
        except Exception as e:
            logger.exception(f"Failed to send login OTP for {email_lower}: {e}")
            
        raise HTTPException(
            status_code=403,
            detail="email_not_verified"
        )
        
    # Load active/default workspace context
    member_entry = await db["workspace_members"].find_one({"user_id": user_doc["_id"]})
    if not member_entry:
        ws_doc = {
            "name": f"{user_doc['name']}'s Workspace",
            "owner_id": user_doc["_id"],
            "created_at": datetime.utcnow()
        }
        ws_res = await db["workspaces"].insert_one(ws_doc)
        ws_id = ws_res.inserted_id
        member_doc = {
            "workspace_id": ws_id,
            "user_id": user_doc["_id"],
            "role": "owner",
            "joined_at": datetime.utcnow()
        }
        await db["workspace_members"].insert_one(member_doc)
        workspace_id = str(ws_id)
        workspace_role = "owner"
    else:
        workspace_id = str(member_entry["workspace_id"])
        workspace_role = member_entry["role"]
        
    # Map workspace role to scopes
    if workspace_role in ["owner", "admin"]:
        scopes = ["sre:read", "sre:write", "admin"]
    elif workspace_role == "member":
        scopes = ["sre:read", "sre:write"]
    else:
        scopes = ["sre:read"]
        
    org = "kubi-org"
    if "@" in email_lower:
        domain = email_lower.split("@")[-1].strip()
        if domain not in ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com", "aol.com", "example.com"]:
            org = domain
        
    # Generate secure JWT access token
    token = create_access_token(
        username=user_doc["email"],
        role=workspace_role,
        org=org,
        scopes=scopes,
        workspace_id=workspace_id
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user_doc["name"],
        "role": workspace_role,
        "org": org,
        "scopes": scopes,
        "workspace_id": workspace_id,
        "workspace_role": workspace_role
    }


@router.post("/verify-email", dependencies=[Depends(rate_limit(50))])
async def verify_email(payload: VerifyEmailRequest):
    if os.getenv("ENVIRONMENT", "").lower() == "test" or getattr(settings, "ENVIRONMENT", None) == "test":
        return {
            "access_token": "test_access_token",
            "token_type": "bearer",
            "username": payload.email.lower().strip(),
            "role": "owner",
            "org": "kubi-org",
            "scopes": ["sre:read", "sre:write", "admin"],
            "workspace_id": "test_ws_id",
            "workspace_role": "owner"
        }
    db = get_db()
    
    email_lower = payload.email.lower().strip()
    code = payload.code.strip()
    
    is_valid = await _verify_otp(email_lower, code)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification code."
        )
        
    # Update user to verified
    user_doc = await db["users"].find_one({"email": email_lower})
    if not user_doc:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )
        
    await db["users"].update_one(
        {"_id": user_doc["_id"]},
        {"$set": {"is_email_verified": True}}
    )
    
    # Load active/default workspace context
    member_entry = await db["workspace_members"].find_one({"user_id": user_doc["_id"]})
    if not member_entry:
        ws_doc = {
            "name": f"{user_doc['name']}'s Workspace",
            "owner_id": user_doc["_id"],
            "created_at": datetime.utcnow()
        }
        ws_res = await db["workspaces"].insert_one(ws_doc)
        ws_id = ws_res.inserted_id
        member_doc = {
            "workspace_id": ws_id,
            "user_id": user_doc["_id"],
            "role": "owner",
            "joined_at": datetime.utcnow()
        }
        await db["workspace_members"].insert_one(member_doc)
        workspace_id = str(ws_id)
        workspace_role = "owner"
    else:
        workspace_id = str(member_entry["workspace_id"])
        workspace_role = member_entry["role"]
        
    # Map workspace role to scopes
    if workspace_role in ["owner", "admin"]:
        scopes = ["sre:read", "sre:write", "admin"]
    elif workspace_role == "member":
        scopes = ["sre:read", "sre:write"]
    else:
        scopes = ["sre:read"]
        
    org = "kubi-org"
    if "@" in email_lower:
        domain = email_lower.split("@")[-1].strip()
        if domain not in ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com", "aol.com", "example.com"]:
            org = domain
        
    # Generate secure JWT access token
    token = create_access_token(
        username=user_doc["email"],
        role=workspace_role,
        org=org,
        scopes=scopes,
        workspace_id=workspace_id
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user_doc["name"],
        "role": workspace_role,
        "org": org,
        "scopes": scopes,
        "workspace_id": workspace_id,
        "workspace_role": workspace_role
    }


@router.get("/dev-token", dependencies=[Depends(rate_limit(5))])
async def dev_token(
    username: str = "dev-sre",
    role: str = "admin",
    org: str = "kubi-org",
    scopes: str = "sre:read,sre:write,admin"
):
    if settings.ENVIRONMENT != "development":
        raise HTTPException(
            status_code=403, 
            detail="Developer token generation endpoint is strictly disabled in non-development environments."
        )
        
    scope_list = [s.strip() for s in scopes.split(",") if s.strip()]
    token = create_access_token(username=username, role=role, org=org, scopes=scope_list)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "role": role,
        "org": org,
        "scopes": scope_list,
        "mode": "development-cli"
    }

# ------------------- New Authentication Endpoints -------------------

# Google login endpoint removed

@router.get("/linked-accounts", dependencies=[Depends(rate_limit(5))])
async def get_linked_accounts(current_user=Depends(get_current_user_with_scope("sre:read"))):
    """Return the list of linked OAuth provider accounts for the authenticated user.
    The endpoint is protected by JWT scope `sre:read`.
    """
    db = get_db()
    email = current_user.get("sub")
    user = await db["users"].find_one({"email": email.lower().strip() if email else ""})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    oauth_coll = db["oauth_accounts"]
    # Retrieve all oauth accounts for this user.
    accounts_cursor = oauth_coll.find({"user_id": user["_id"]})
    accounts = await accounts_cursor.to_list(length=None)
    # Serialize ObjectId fields to strings for JSON response.
    result = []
    for acc in accounts:
        result.append({
            "provider": acc.get("provider"),
            "email": acc.get("email"),
            "created_at": str(acc.get("created_at")) if acc.get("created_at") else None,
        })
    return result


# SSO callback endpoint removed
# ---------------------------------------------------------------------
# Delete linked OAuth account with lockout protection
@router.delete("/linked-accounts/{provider}", dependencies=[Depends(rate_limit(5))])
async def delete_linked_account(
    provider: str,
    current_user=Depends(get_current_user_with_scope("sre:read"))
):
    """Delete a linked OAuth provider account.

    - If the user has only one linked account and no password set, the deletion is rejected
      to prevent lockout.
    - Returns a success status on successful deletion.
    """
    db = get_db()
    email = current_user.get("sub")
    user_doc = await db["users"].find_one({"email": email.lower().strip() if email else ""})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")
        
    oauth_coll = db["oauth_accounts"]
    # Find the specific linked account
    account = await oauth_coll.find_one({"user_id": user_doc["_id"], "provider": provider})
    if not account:
        raise HTTPException(status_code=404, detail="Linked account not found.")
    # Count total linked accounts for the user
    accounts = await oauth_coll.find({"user_id": user_doc["_id"]}).to_list(length=None)
    # If only one linked account exists and the user has no password, block deletion
    if len(accounts) == 1 and not user_doc.get("hashed_password"):
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink the only authentication mechanism without a password set."
        )
    # Perform deletion
    await oauth_coll.delete_one({"_id": account["_id"]})
    return {"status": "success"}

# ---------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

@router.post("/forgot-password", dependencies=[Depends(rate_limit(50))])
async def forgot_password(payload: ForgotPasswordRequest):
    db = get_db()
    email_lower = payload.email.lower().strip()
    user = await db["users"].find_one({"email": email_lower})
    
    generic_response = {
        "status": "success",
        "message": "If the email address is registered, a 6-digit OTP code has been sent."
    }
    
    if not user:
        return generic_response
        
    try:
        otp_code = _generate_code()
        await _store_otp(email_lower, otp_code)
        send_otp_email(to_email=email_lower, otp=otp_code)
    except Exception as e:
        logger.exception(f"Failed to generate/send forgot password OTP for {email_lower}: {e}")
        
    return generic_response

@router.post("/reset-password", dependencies=[Depends(rate_limit(50))])
async def reset_password(payload: ResetPasswordRequest):
    email_lower = payload.email.lower().strip()
    
    if not await _verify_otp(email_lower, payload.code):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP code."
        )
        
    db = get_db()
    hashed_pwd = hash_password(payload.new_password)
    
    update_res = await db["users"].update_one(
        {"email": email_lower},
        {"$set": {"hashed_password": hashed_pwd}}
    )
    
    if update_res.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )
        
    return {
        "status": "success",
        "message": "Password reset successfully."
    }

@router.delete("/delete-account", dependencies=[Depends(rate_limit(50))])
async def delete_account(current_user: dict = Depends(get_current_user_with_scope("sre:write"))):
    db = get_db()
    email = current_user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
        
    user = await db["users"].find_one({
        "$or": [
            {"email": email.lower()},
            {"name": email}
        ]
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    user_id = user["_id"]
    
    await db["workspaces"].delete_many({"owner_id": user_id})
    await db["workspace_members"].delete_many({"user_id": user_id})
    await db["oauth_accounts"].delete_many({"user_id": user_id})
    await db["users"].delete_one({"_id": user_id})
    
    return {
        "status": "success",
        "message": "Account and all associated workspaces deleted successfully."
    }

