from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.core.auth import create_access_token
import urllib.parse
import requests
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/login/{provider}")
async def login(provider: str):
    if provider not in ["google", "github", "gitlab"]:
        raise HTTPException(status_code=400, detail="Unsupported authentication provider")

    # If client ID or secret are missing, perform immediate mock dev fallback redirection
    if not settings.SSO_CLIENT_ID or not settings.SSO_CLIENT_SECRET:
        mock_callback_url = f"{settings.SSO_REDIRECT_URI}?code=mock_dev_code&state={provider}"
        logger.info(f"OIDC credentials not set. Falling back to local dev redirect: {mock_callback_url}")
        return RedirectResponse(url=mock_callback_url)

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

@router.get("/callback")
async def callback(code: str, state: str):
    provider = state
    if provider not in ["google", "github", "gitlab"]:
        provider = "google"
        
    # Standard fallback if credentials are absent or it's a dev login
    if code == "mock_dev_code" or not settings.SSO_CLIENT_ID or not settings.SSO_CLIENT_SECRET:
        username = f"dev-sre-{provider}"
        scopes = ["sre:read", "sre:write", "admin"]
        token = create_access_token(username=username, scopes=scopes)
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "scopes": scopes,
            "provider": provider,
            "mode": "development-fallback"
        }

    # In production mode (when credentials are present), we perform actual code exchange
    try:
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
            
        scopes = ["sre:read", "sre:write"]
        if "admin" in username.lower() or "@kubi.ai" in username.lower():
            scopes.append("admin")
            
        token = create_access_token(username=username, scopes=scopes)
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "scopes": scopes,
            "provider": provider,
            "mode": "production"
        }
    except Exception as e:
        logger.error(f"Error during SSO auth code exchange: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@router.get("/dev-token")
async def dev_token(username: str = "dev-sre", scopes: str = "sre:read,sre:write"):
    scope_list = [s.strip() for s in scopes.split(",") if s.strip()]
    token = create_access_token(username=username, scopes=scope_list)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "scopes": scope_list,
        "mode": "development-cli"
    }
