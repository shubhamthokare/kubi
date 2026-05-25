from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.core.auth import create_access_token
from app.core.security import rate_limit
import urllib.parse
import requests
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def map_sso_user(username: str, email: str = "") -> tuple[str, str, list[str]]:
    """
    Maps an SSO profile to a professional SRE (role, organization, scopes) tuple.
    Supports secure separation of concerns for SRE multi-tenancy.
    """
    org = "kubi-org"
    if email and "@" in email:
        org = email.split("@")[-1].strip()
        
    # Standardize names for role parsing
    name_lower = username.lower()
    email_lower = email.lower() if email else ""
    
    # ── Role & Scope Determination ──────────────────────────────────────
    if "admin" in name_lower or "admin" in email_lower or "@kubi.ai" in email_lower:
        role = "admin"
        scopes = ["sre:read", "sre:write", "admin"]
    elif "sre" in name_lower or "sre" in email_lower or "ops" in name_lower:
        role = "sre-write"
        scopes = ["sre:read", "sre:write"]
    else:
        role = "viewer"
        scopes = ["sre:read"]
        
    return role, org, scopes


@router.get("/login/{provider}", dependencies=[Depends(rate_limit(20))])
async def login(provider: str):
    if provider not in ["google", "github", "gitlab"]:
        raise HTTPException(status_code=400, detail="Unsupported authentication provider")

    # If client ID or secret are missing, perform mock dev redirection ONLY in local development
    if not settings.SSO_CLIENT_ID or not settings.SSO_CLIENT_SECRET:
        if settings.ENVIRONMENT == "development":
            mock_callback_url = f"/auth/callback?code=mock_dev_code&state={provider}"
            logger.info(f"OIDC credentials not set. Falling back to local dev redirect: {mock_callback_url}")
            return RedirectResponse(url=mock_callback_url)
        else:
            raise HTTPException(
                status_code=501, 
                detail=f"OIDC client credentials for {provider} provider are not configured on this server."
            )

    # Determine OAuth2 endpoints based on provider
    if provider == "google":
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        scope = "openid email profile"
    elif provider == "github":
        auth_url = "https://github.com/login/oauth/authorize"
        scope = "read:user user:email"
    else:  # gitlab
        auth_url = f"{settings.GITLAB_API_URL.replace('/api/v4', '')}/oauth/authorize"
        scope = "openid read_user"

    params = {
        "client_id": settings.SSO_CLIENT_ID,
        "redirect_uri": settings.SSO_REDIRECT_URI,
        "response_type": "code",
        "scope": scope,
        "state": provider,
    }
    
    url = f"{auth_url}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url)


@router.get("/callback", dependencies=[Depends(rate_limit(20))])
async def callback(code: str, state: str):
    provider = state
    if provider not in ["google", "github", "gitlab"]:
        provider = "google"
        
    # Standard fallback if credentials are absent or it's a dev login
    if code == "mock_dev_code" or not settings.SSO_CLIENT_ID or not settings.SSO_CLIENT_SECRET:
        if settings.ENVIRONMENT != "development":
            raise HTTPException(
                status_code=401, 
                detail="Direct mock authentication bypass is disabled in non-development environments."
            )
            
        username = f"dev-sre-{provider}"
        role, org, scopes = map_sso_user(username, f"dev-sre@{provider}.local")
        token = create_access_token(username=username, role=role, org=org, scopes=scopes)
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "role": role,
            "org": org,
            "scopes": scopes,
            "provider": provider,
            "mode": "development-fallback"
        }

    # In production mode (when credentials are present), we perform actual code exchange
    try:
        email = ""
        if provider == "google":
            token_url = "https://oauth2.googleapis.com/token"
            data = {
                "code": code,
                "client_id": settings.SSO_CLIENT_ID,
                "client_secret": settings.SSO_CLIENT_SECRET,
                "redirect_uri": settings.SSO_REDIRECT_URI,
                "grant_type": "authorization_code"
            }
            res = requests.post(token_url, data=data, timeout=5)
            res.raise_for_status()
            tokens = res.json()
            userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
            user_res = requests.get(userinfo_url, headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=5)
            user_res.raise_for_status()
            userinfo = user_res.json()
            username = userinfo.get("email", "unknown-google-user")
            email = userinfo.get("email", "")
        elif provider == "github":
            token_url = "https://github.com/login/oauth/access_token"
            headers = {"Accept": "application/json"}
            data = {
                "code": code,
                "client_id": settings.SSO_CLIENT_ID,
                "client_secret": settings.SSO_CLIENT_SECRET,
                "redirect_uri": settings.SSO_REDIRECT_URI,
            }
            res = requests.post(token_url, data=data, headers=headers, timeout=5)
            res.raise_for_status()
            tokens = res.json()
            userinfo_url = "https://api.github.com/user"
            user_res = requests.get(userinfo_url, headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=5)
            user_res.raise_for_status()
            userinfo = user_res.json()
            username = userinfo.get("login", "unknown-github-user")
            email = userinfo.get("email", "")
        else: # gitlab
            gitlab_base = settings.GITLAB_API_URL.replace('/api/v4', '')
            token_url = f"{gitlab_base}/oauth/token"
            data = {
                "code": code,
                "client_id": settings.SSO_CLIENT_ID,
                "client_secret": settings.SSO_CLIENT_SECRET,
                "redirect_uri": settings.SSO_REDIRECT_URI,
                "grant_type": "authorization_code"
            }
            res = requests.post(token_url, data=data, timeout=5)
            res.raise_for_status()
            tokens = res.json()
            userinfo_url = f"{settings.GITLAB_API_URL}/user"
            user_res = requests.get(userinfo_url, headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=5)
            user_res.raise_for_status()
            userinfo = user_res.json()
            username = userinfo.get("username", "unknown-gitlab-user")
            email = userinfo.get("email", "")
            
        role, org, scopes = map_sso_user(username, email)
        token = create_access_token(username=username, role=role, org=org, scopes=scopes)
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "role": role,
            "org": org,
            "scopes": scopes,
            "provider": provider,
            "mode": "production"
        }
    except Exception as e:
        logging.exception(f"Error during SSO auth code exchange: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


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
