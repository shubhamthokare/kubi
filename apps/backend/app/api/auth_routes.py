from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.core.auth import create_access_token
from app.core.security import rate_limit, get_current_user_with_scope
from app.db.database import get_db
from datetime import datetime
from bson import ObjectId
from typing import Optional
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
async def login(provider: str, prompt: Optional[str] = None):
    if provider not in ["google", "github", "gitlab"]:
        raise HTTPException(status_code=400, detail="Unsupported authentication provider")

    # If client ID or secret are missing, perform mock dev redirection ONLY in local development
    if not settings.SSO_CLIENT_ID or not settings.SSO_CLIENT_SECRET:
        if settings.ENVIRONMENT == "development":
            mock_callback_url = f"/api/auth/callback?code=mock_dev_code&state={provider}"
            if prompt:
                mock_callback_url += f"&prompt={prompt}"
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
    
    if prompt:
        if provider == "github":
            params["prompt"] = "login"  # Force credential re-entry on GitHub
        else:
            params["prompt"] = prompt  # Standard OIDC select_account / login / consent
    
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
        email = f"dev-sre@{provider}.local"
        role, org, scopes = map_sso_user(username, email)
        
        # Look up or create the user in the database
        db = get_db()
        user_doc = await db["users"].find_one({"email": email})
        if not user_doc:
            user_doc = {
                "email": email,
                "name": username,
                "hashed_password": None,
                "is_email_verified": True,
                "created_at": datetime.utcnow()
            }
            res = await db["users"].insert_one(user_doc)
            user_doc["_id"] = res.inserted_id
            
            # Create default workspace
            ws_doc = {
                "name": f"{user_doc['name']}'s Workspace",
                "owner_id": user_doc["_id"],
                "created_at": datetime.utcnow()
            }
            ws_res = await db["workspaces"].insert_one(ws_doc)
            ws_id = ws_res.inserted_id
            
            # Create workspace member entry
            member_doc = {
                "workspace_id": ws_id,
                "user_id": user_doc["_id"],
                "role": "owner",
                "joined_at": datetime.utcnow()
            }
            await db["workspace_members"].insert_one(member_doc)
            
            # Create linked oauth account
            oauth_doc = {
                "user_id": user_doc["_id"],
                "provider": provider,
                "provider_account_id": username,
                "email": email,
                "created_at": datetime.utcnow()
            }
            await db["oauth_accounts"].insert_one(oauth_doc)
            workspace_id = str(ws_id)
            workspace_role = "owner"
        else:
            # Existing user - find or link oauth
            oauth_doc = await db["oauth_accounts"].find_one({"user_id": user_doc["_id"], "provider": provider})
            if not oauth_doc:
                oauth_doc = {
                    "user_id": user_doc["_id"],
                    "provider": provider,
                    "provider_account_id": username,
                    "email": email,
                    "created_at": datetime.utcnow()
                }
                await db["oauth_accounts"].insert_one(oauth_doc)
            
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
                
        # Align scopes to the workspace role
        if workspace_role in ["owner", "admin"]:
            scopes = ["sre:read", "sre:write", "admin"]
        elif workspace_role == "member":
            scopes = ["sre:read", "sre:write"]
        else: # viewer
            scopes = ["sre:read"]

        token = create_access_token(
            username=username, 
            role=workspace_role, 
            org=org, 
            scopes=scopes, 
            workspace_id=workspace_id
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "role": workspace_role,
            "org": org,
            "scopes": scopes,
            "provider": provider,
            "workspace_id": workspace_id,
            "workspace_role": workspace_role,
            "mode": "development-fallback"
        }

    # In production mode (when credentials are present), we perform actual code exchange
    try:
        email = ""
        user_id_str = ""
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
            user_id_str = str(userinfo.get("sub", "unknown-google-id"))
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
            user_id_str = str(userinfo.get("id", "unknown-github-id"))
            
            # Enforce verified primary email check for GitHub OIDC
            if not email:
                email_res = requests.get("https://api.github.com/user/emails", headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=5)
                if email_res.status_code == 200:
                    emails_list = email_res.json()
                    for e_entry in emails_list:
                        if e_entry.get("primary") and e_entry.get("verified"):
                            email = e_entry.get("email")
                            break
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
            user_id_str = str(userinfo.get("id", "unknown-gitlab-id"))
            
        if not email:
            raise HTTPException(status_code=400, detail="SSO provider did not return a verified email address.")
            
        role, org, scopes = map_sso_user(username, email)
        
        # Database verification, creation, and account linking
        db = get_db()
        user_doc = await db["users"].find_one({"email": email})
        if not user_doc:
            user_doc = {
                "email": email,
                "name": username or email.split("@")[0],
                "hashed_password": None,
                "is_email_verified": True,
                "created_at": datetime.utcnow()
            }
            res = await db["users"].insert_one(user_doc)
            user_doc["_id"] = res.inserted_id
            
            # Create default workspace
            ws_doc = {
                "name": f"{user_doc['name']}'s Workspace",
                "owner_id": user_doc["_id"],
                "created_at": datetime.utcnow()
            }
            ws_res = await db["workspaces"].insert_one(ws_doc)
            ws_id = ws_res.inserted_id
            
            # Create workspace member entry
            member_doc = {
                "workspace_id": ws_id,
                "user_id": user_doc["_id"],
                "role": "owner",
                "joined_at": datetime.utcnow()
            }
            await db["workspace_members"].insert_one(member_doc)
            
            # Create linked oauth account
            oauth_doc = {
                "user_id": user_doc["_id"],
                "provider": provider,
                "provider_account_id": user_id_str,
                "email": email,
                "created_at": datetime.utcnow()
            }
            await db["oauth_accounts"].insert_one(oauth_doc)
            workspace_id = str(ws_id)
            workspace_role = "owner"
        else:
            # Existing user - find or link oauth
            oauth_doc = await db["oauth_accounts"].find_one({"user_id": user_doc["_id"], "provider": provider})
            if not oauth_doc:
                oauth_doc = {
                    "user_id": user_doc["_id"],
                    "provider": provider,
                    "provider_account_id": user_id_str,
                    "email": email,
                    "created_at": datetime.utcnow()
                }
                await db["oauth_accounts"].insert_one(oauth_doc)
            
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
                
        # Align scopes to the workspace role
        if workspace_role in ["owner", "admin"]:
            scopes = ["sre:read", "sre:write", "admin"]
        elif workspace_role == "member":
            scopes = ["sre:read", "sre:write"]
        else: # viewer
            scopes = ["sre:read"]

        token = create_access_token(
            username=username, 
            role=workspace_role, 
            org=org, 
            scopes=scopes, 
            workspace_id=workspace_id
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": username,
            "role": workspace_role,
            "org": org,
            "scopes": scopes,
            "provider": provider,
            "workspace_id": workspace_id,
            "workspace_role": workspace_role,
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


@router.get("/linked-accounts", dependencies=[Depends(rate_limit(20))])
async def get_linked_accounts(
    payload: dict = Depends(get_current_user_with_scope("sre:read"))
):
    """Lists all linked SSO OAuth accounts for the authenticated user."""
    db = get_db()
    user = await db["users"].find_one({"email": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    oauth_list = await db["oauth_accounts"].find({"user_id": user["_id"]}).to_list(length=None)
    
    result = []
    for oa in oauth_list:
        result.append({
            "provider": oa["provider"],
            "email": oa.get("email", ""),
            "created_at": oa.get("created_at")
        })
    return result


@router.delete("/linked-accounts/{provider}", dependencies=[Depends(rate_limit(10))])
async def unlink_account(
    provider: str,
    payload: dict = Depends(get_current_user_with_scope("sre:write"))
):
    """Unlinks a specific SSO OAuth provider.
    
    Ensures the user doesn't lock themselves out by verifying they either have a local password set, 
    or have at least one other active linked account.
    """
    if provider not in ["google", "github", "gitlab"]:
        raise HTTPException(status_code=400, detail="Invalid provider")
        
    db = get_db()
    user = await db["users"].find_one({"email": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    # Check if the provider is actually linked
    target_oauth = await db["oauth_accounts"].find_one({
        "user_id": user["_id"],
        "provider": provider
    })
    if not target_oauth:
        raise HTTPException(
            status_code=404, 
            detail=f"OAuth provider '{provider}' is not linked to this account."
        )
        
    # Validate lockout protection
    all_linked = await db["oauth_accounts"].find({"user_id": user["_id"]}).to_list(length=None)
    has_local_password = user.get("hashed_password") is not None
    
    if not has_local_password and len(all_linked) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink the only authentication mechanism. Please configure a password or link another provider first."
        )
        
    # Perform unlinking
    await db["oauth_accounts"].delete_one({"_id": target_oauth["_id"]})
    
    return {"status": "success", "message": f"Successfully unlinked {provider} provider."}
