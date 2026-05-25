from fastapi import APIRouter, HTTPException, Depends, status, Response
from typing import List, Dict, Any
from bson import ObjectId
from datetime import datetime

from app.core.security import get_current_user_with_scope, rate_limit
from app.core.auth import create_access_token
from app.db.database import get_db
from app.api.schemas import CreateWorkspaceRequest, InviteMemberRequest

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

# ---------------------------------------------------------------------------
# RBAC Scoping FastAPI Dependencies
# ---------------------------------------------------------------------------

async def get_current_workspace_user(
    workspace_id: str,
    payload: dict = Depends(get_current_user_with_scope("sre:read"))
):
    """FastAPI Dependency that resolves the active user and checks their workspace access.

    Returns user information and membership details (including their workspace-specific role).
    """
    db = get_db()
    # Find active user from sub (email or username)
    user = await db["users"].find_one({"email": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Authenticated user not found.")
        
    try:
        ws_oid = ObjectId(workspace_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workspace ID format.")
        
    # Check membership
    membership = await db["workspace_members"].find_one({
        "workspace_id": ws_oid,
        "user_id": user["_id"]
    })
    
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You are not a member of this workspace."
        )
        
    return {
        "user": user,
        "membership": membership,
        "role": membership["role"] # 'owner', 'admin', 'member', 'viewer'
    }

def require_workspace_role(allowed_roles: List[str]):
    """Returns a dependency that validates the user's role in the current workspace."""
    async def dependency(workspace_user: dict = Depends(get_current_workspace_user)):
        if workspace_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: Action requires one of workspace roles: {allowed_roles}"
            )
        return workspace_user
    return dependency

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", dependencies=[Depends(rate_limit(60))])
async def list_workspaces(payload: dict = Depends(get_current_user_with_scope("sre:read"))):
    """Lists all workspaces that the authenticated user has access to."""
    db = get_db()
    user = await db["users"].find_one({"email": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    memberships = await db["workspace_members"].find({"user_id": user["_id"]}).to_list(length=None)
    
    workspace_ids = [m["workspace_id"] for m in memberships]
    workspaces = await db["workspaces"].find({"_id": {"$in": workspace_ids}}).to_list(length=None)
    
    # Map role info to workspace response
    role_map = {str(m["workspace_id"]): m["role"] for m in memberships}
    
    result = []
    for ws in workspaces:
        ws_id_str = str(ws["_id"])
        result.append({
            "id": ws_id_str,
            "name": ws["name"],
            "role": role_map.get(ws_id_str, "viewer"),
            "created_at": ws.get("created_at")
        })
        
    return result

@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit(10))])
async def create_workspace(
    req: CreateWorkspaceRequest,
    payload: dict = Depends(get_current_user_with_scope("sre:write"))
):
    """Creates a new workspace, seeding the creator as the Owner."""
    db = get_db()
    user = await db["users"].find_one({"email": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    ws_doc = {
        "name": req.name,
        "owner_id": user["_id"],
        "created_at": datetime.utcnow()
    }
    
    ws_res = await db["workspaces"].insert_one(ws_doc)
    ws_id = ws_res.inserted_id
    
    # Add creator as Owner in members collection
    member_doc = {
        "workspace_id": ws_id,
        "user_id": user["_id"],
        "role": "owner",
        "joined_at": datetime.utcnow()
    }
    await db["workspace_members"].insert_one(member_doc)
    
    return {
        "id": str(ws_id),
        "name": req.name,
        "role": "owner",
        "created_at": ws_doc["created_at"]
    }

@router.post("/{workspace_id}/invite", dependencies=[Depends(rate_limit(10)), Depends(require_workspace_role(["owner", "admin"]))])
async def invite_member(
    workspace_id: str,
    req: InviteMemberRequest,
    workspace_user: dict = Depends(get_current_workspace_user)
):
    """Invites a user by email to join the workspace with a specific RBAC role.

    If the user does not exist yet, a placeholder account is created so they join upon first signup.
    """
    if req.role not in ["admin", "member", "viewer"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid role scope. Must be one of: 'admin', 'member', 'viewer'"
        )
        
    db = get_db()
    invitee = await db["users"].find_one({"email": req.email})
    
    if not invitee:
        # Create placeholder account
        invitee_doc = {
            "email": req.email,
            "name": req.email.split("@")[0],
            "hashed_password": None,
            "is_email_verified": False,
            "created_at": datetime.utcnow()
        }
        ins_res = await db["users"].insert_one(invitee_doc)
        invitee_id = ins_res.inserted_id
    else:
        invitee_id = invitee["_id"]
        
    # Check if they are already in the workspace
    existing = await db["workspace_members"].find_one({
        "workspace_id": ObjectId(workspace_id),
        "user_id": invitee_id
    })
    
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"User {req.email} is already a member of this workspace."
        )
        
    # Create membership
    member_doc = {
        "workspace_id": ObjectId(workspace_id),
        "user_id": invitee_id,
        "role": req.role,
        "joined_at": datetime.utcnow()
    }
    await db["workspace_members"].insert_one(member_doc)
    
    # Audit log
    await db["audit_logs"].insert_one({
        "workspace_id": ObjectId(workspace_id),
        "user_id": workspace_user["user"]["_id"],
        "action": "workspace_user_invited",
        "details": {
            "invited_email": req.email,
            "assigned_role": req.role
        },
        "timestamp": datetime.utcnow()
    })
    
    return {"status": "success", "message": f"Successfully invited {req.email} to workspace."}

@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit(10))])
async def revoke_membership(
    workspace_id: str,
    user_id: str,
    workspace_user: dict = Depends(get_current_workspace_user)
):
    """Revokes workspace membership. Enforces strict administrative protection rules."""
    caller_role = workspace_user["role"]
    if caller_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Action requires workspace Admin or Owner.")
        
    db = get_db()
    try:
        target_uid = ObjectId(user_id)
        ws_oid = ObjectId(workspace_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID formats.")
        
    target_member = await db["workspace_members"].find_one({
        "workspace_id": ws_oid,
        "user_id": target_uid
    })
    
    if not target_member:
        raise HTTPException(status_code=404, detail="Workspace membership record not found.")
        
    # Protection Rules:
    # 1. You cannot remove the workspace Owner.
    if target_member["role"] == "owner":
        raise HTTPException(status_code=409, detail="Workspace Owner cannot be removed. Transfer ownership first.")
        
    # 2. Workspace Admin cannot remove another Admin or the Owner.
    if caller_role == "admin" and target_member["role"] == "admin":
        raise HTTPException(status_code=403, detail="Workspace Admins cannot revoke access of other Admins.")
        
    # Revoke
    await db["workspace_members"].delete_one({"_id": target_member["_id"]})
    
    # Audit Log
    await db["audit_logs"].insert_one({
        "workspace_id": ws_oid,
        "user_id": workspace_user["user"]["_id"],
        "action": "workspace_user_removed",
        "details": {
            "removed_user_id": target_uid,
            "removed_role": target_member["role"]
        },
        "timestamp": datetime.utcnow()
    })
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/{workspace_id}/switch", dependencies=[Depends(rate_limit(20))])
async def switch_workspace(
    workspace_id: str,
    workspace_user: dict = Depends(get_current_workspace_user)
):
    """Generates and issues a new JWT token scoped specifically to the newly switched workspace."""
    # Build JWT matching the new workspace role
    user = workspace_user["user"]
    new_role = workspace_user["role"]
    ws_id = workspace_id
    
    # Set scopes based on workspace role
    org = user.get("org", "kubi-org")
    if new_role in ["owner", "admin"]:
        scopes = ["sre:read", "sre:write", "admin"]
    elif new_role == "member":
        scopes = ["sre:read", "sre:write"]
    else: # viewer
        scopes = ["sre:read"]
        
    token = create_access_token(
        username=user["email"],
        role=new_role,
        org=org,
        scopes=scopes,
        workspace_id=ws_id
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "workspace_id": ws_id,
        "workspace_role": new_role
    }
