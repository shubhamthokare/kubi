from fastapi import Depends, HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.auth import decode_jwt_token, verify_token_scopes
from app.core.config import settings
import time
from threading import Lock

security_bearer = HTTPBearer(auto_error=False)

def get_current_user_with_scope(required_scope: str):
    def dependency(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)):
        if not credentials:
            raise HTTPException(status_code=401, detail="Authentication token required")
        
        token = credentials.credentials
        try:
            payload = decode_jwt_token(token, settings.JWT_SECRET_KEY)
        except ValueError as e:
            raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")
            
        if not verify_token_scopes(payload, required_scope):
            raise HTTPException(
                status_code=403, 
                detail=f"Missing required permission scope: {required_scope}"
            )
            
        return payload
    return dependency

class InMemoryRateLimiter:
    def __init__(self):
        self._requests = {}
        self._lock = Lock()
        
    def check_rate_limit(self, ip: str, limit: int, window: int = 60):
        with self._lock:
            now = time.time()
            cutoff = now - window
            
            if ip not in self._requests:
                self._requests[ip] = []
                
            self._requests[ip] = [ts for ts in self._requests[ip] if ts > cutoff]
            
            if len(self._requests[ip]) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Maximum {limit} requests per {window} seconds."
                )
                
            self._requests[ip].append(now)

rate_limiter = InMemoryRateLimiter()

def rate_limit(limit: int, window: int = 60):
    async def dependency(request: Request):
        # Extract the original client IP behind proxy/load balancer/Next.js rewrite
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            ip = x_forwarded_for.split(",")[0].strip()
        else:
            ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "127.0.0.1")
        rate_limiter.check_rate_limit(ip, limit, window)
    return dependency
