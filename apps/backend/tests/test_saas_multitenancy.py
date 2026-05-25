import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from bson import ObjectId
import time

from main import app
from app.core.auth import create_access_token, decode_jwt_token
from app.core.security import rate_limiter

class TestSaasMultitenancy(unittest.TestCase):
    def setUp(self):
        rate_limiter._requests = {}

    @patch('app.api.auth_routes_otp.send_otp_email')
    @patch('app.api.auth_routes_otp.get_db')
    def test_otp_flow(self, mock_get_db, mock_send_email):
        client = TestClient(app)
        
        # 1. Mock DB collection responses
        mock_db = MagicMock()
        mock_otps = MagicMock()
        
        # Async mocks for mongo queries
        mock_otps.insert_one = AsyncMock(return_value=MagicMock())
        mock_db.__getitem__.return_value = mock_otps
        mock_get_db.return_value = mock_db
        
        # Mock Email sending
        mock_send_email.return_value = True
        
        # Test Send OTP Route
        response = client.post("/api/auth/otp/send", json={"email": "alice@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"detail": "OTP sent"})
        
        # Verify store and send were triggered
        self.assertTrue(mock_otps.insert_one.called)
        self.assertTrue(mock_send_email.called)
        
        # 2. Test Verify OTP Route
        # Mock successful lookup for valid active OTP
        mock_otps.find_one = AsyncMock(return_value={
            "_id": ObjectId(),
            "email": "alice@example.com",
            "code": "123456",
            "expires_at": datetime.utcnow() + timedelta(minutes=10)
        })
        mock_otps.delete_one = AsyncMock(return_value=MagicMock())
        
        response_verify = client.post("/api/auth/otp/verify", json={"email": "alice@example.com", "code": "123456"})
        self.assertEqual(response_verify.status_code, 200)
        self.assertIn("access_token", response_verify.json())
        self.assertEqual(response_verify.json()["token_type"], "bearer")

    @patch('app.api.auth_routes.get_db')
    def test_sso_callback_account_linking(self, mock_get_db):
        client = TestClient(app)
        
        # Mock Database and nested collections
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_workspaces = MagicMock()
        mock_members = MagicMock()
        mock_oauth = MagicMock()
        
        mock_db.__getitem__.side_effect = lambda name: {
            "users": mock_users,
            "workspaces": mock_workspaces,
            "workspace_members": mock_members,
            "oauth_accounts": mock_oauth
        }[name]
        mock_get_db.return_value = mock_db
        
        # 1. Scenario: New User OIDC Registration
        mock_users.find_one = AsyncMock(return_value=None)
        
        user_oid = ObjectId()
        mock_users.insert_one = AsyncMock(return_value=MagicMock(inserted_id=user_oid))
        
        ws_oid = ObjectId()
        mock_workspaces.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ws_oid))
        
        mock_members.insert_one = AsyncMock(return_value=MagicMock())
        mock_oauth.insert_one = AsyncMock(return_value=MagicMock())
        
        # Trigger local development callback flow
        with patch('app.api.auth_routes.settings.ENVIRONMENT', 'development'):
            response = client.get("/api/auth/callback?code=mock_dev_code&state=github")
            
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["mode"], "development-fallback")
        self.assertEqual(data["workspace_id"], str(ws_oid))
        self.assertEqual(data["workspace_role"], "owner")
        self.assertIn("access_token", data)
        
        # Decode and verify payload
        from app.core.config import settings
        decoded = decode_jwt_token(data["access_token"], settings.JWT_SECRET_KEY)
        self.assertEqual(decoded["workspace_id"], str(ws_oid))
        self.assertEqual(decoded["role"], "owner")

        # 2. Scenario: Existing User logging in via different SSO provider (Account Linking)
        # Mock existing user lookup
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_oid,
            "email": "dev-sre-google@google.local",
            "name": "dev-sre-google"
        })
        # Check Oauth details (none exists for GitHub)
        mock_oauth.find_one = AsyncMock(return_value=None)
        # Load existing workspace context
        mock_members.find_one = AsyncMock(return_value={
            "workspace_id": ws_oid,
            "user_id": user_oid,
            "role": "admin"
        })
        
        with patch('app.api.auth_routes.settings.ENVIRONMENT', 'development'):
            # Existing user (dev-sre-google@google.local) logs in with GitHub provider
            response_link = client.get("/api/auth/callback?code=mock_dev_code&state=github")
            
        self.assertEqual(response_link.status_code, 200)
        data_link = response_link.json()
        self.assertEqual(data_link["workspace_id"], str(ws_oid))
        self.assertEqual(data_link["workspace_role"], "admin")
        self.assertTrue(mock_oauth.insert_one.called) # Account linking successfully saved

    @patch('app.api.workspace_routes.get_db')
    def test_workspace_crud_and_rbac(self, mock_get_db):
        client = TestClient(app)
        
        # Mock DB setup
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_workspaces = MagicMock()
        mock_members = MagicMock()
        mock_logs = MagicMock()
        
        mock_db.__getitem__.side_effect = lambda name: {
            "users": mock_users,
            "workspaces": mock_workspaces,
            "workspace_members": mock_members,
            "audit_logs": mock_logs
        }[name]
        mock_get_db.return_value = mock_db
        
        user_oid = ObjectId()
        ws_oid = ObjectId()
        
        # Standard user setups
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_oid,
            "email": "bob@example.com",
            "name": "Bob"
        })
        
        # Mock membership lookup
        mock_members.find_one = AsyncMock(return_value={
            "workspace_id": ws_oid,
            "user_id": user_oid,
            "role": "admin" # Caller is workspace Admin
        })
        
        # Generate token
        token = create_access_token(username="bob@example.com", role="sre-write", org="kubi-org", scopes=["sre:read", "sre:write"])
        headers = {"Authorization": f"Bearer {token}"}
        
        # 1. Test GET /api/workspaces (lists workspaces)
        mock_members.find = MagicMock()
        mock_members.find.return_value.to_list = AsyncMock(return_value=[{
            "workspace_id": ws_oid,
            "user_id": user_oid,
            "role": "admin"
        }])
        mock_workspaces.find = MagicMock()
        mock_workspaces.find.return_value.to_list = AsyncMock(return_value=[{
            "_id": ws_oid,
            "name": "Team Beta",
            "created_at": None
        }])
        
        response_list = client.get("/api/workspaces", headers=headers)
        self.assertEqual(response_list.status_code, 200)
        self.assertEqual(len(response_list.json()), 1)
        self.assertEqual(response_list.json()[0]["name"], "Team Beta")
        self.assertEqual(response_list.json()[0]["role"], "admin")
        
        # 2. Test POST /api/workspaces/{id}/invite (invite members)
        mock_users.find_one.side_effect = [
            {"_id": user_oid, "email": "bob@example.com"}, # Caller lookup
            None # Invitee lookup (new user)
        ]
        mock_users.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
        mock_members.find_one.side_effect = [
            {"workspace_id": ws_oid, "user_id": user_oid, "role": "admin"}, # Dependency lookup
            None # Verify not already member
        ]
        mock_members.insert_one = AsyncMock(return_value=MagicMock())
        mock_logs.insert_one = AsyncMock(return_value=MagicMock())
        
        response_invite = client.post(
            f"/api/workspaces/{ws_oid}/invite", 
            json={"email": "newbie@example.com", "role": "member"},
            headers=headers
        )
        self.assertEqual(response_invite.status_code, 200)
        self.assertEqual(response_invite.json()["status"], "success")
        self.assertTrue(mock_members.insert_one.called)
        
        # 3. Test DELETE /api/workspaces/{id}/members/{user_id} (Revocation protection)
        # Mock Dependency checks
        mock_users.find_one.side_effect = None
        mock_users.find_one = AsyncMock(return_value={"_id": user_oid, "email": "bob@example.com"})
        
        # Target member is Admin, caller is Admin (Admins cannot delete Admins)
        mock_members.find_one.side_effect = [
            {"workspace_id": ws_oid, "user_id": user_oid, "role": "admin"}, # Caller membership
            {"workspace_id": ws_oid, "user_id": ObjectId(), "role": "admin"} # Target membership
        ]
        
        response_revoke_fail = client.delete(
            f"/api/workspaces/{ws_oid}/members/{ObjectId()}",
            headers=headers
        )
        self.assertEqual(response_revoke_fail.status_code, 403) # Forbidden
        
        # Target member is Member, caller is Admin (Allowed)
        target_member_oid = ObjectId()
        mock_members.find_one.side_effect = [
            {"workspace_id": ws_oid, "user_id": user_oid, "role": "admin"}, # Caller
            {"_id": ObjectId(), "workspace_id": ws_oid, "user_id": target_member_oid, "role": "member"} # Target
        ]
        mock_members.delete_one = AsyncMock(return_value=MagicMock())
        
        response_revoke_success = client.delete(
            f"/api/workspaces/{ws_oid}/members/{target_member_oid}",
            headers=headers
        )
        self.assertEqual(response_revoke_success.status_code, 204) # No Content
        self.assertTrue(mock_members.delete_one.called)

    @patch('app.api.workspace_routes.get_db')
    def test_switch_workspace(self, mock_get_db):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_members = MagicMock()
        mock_db.__getitem__.side_effect = lambda name: {"users": mock_users, "workspace_members": mock_members}[name]
        mock_get_db.return_value = mock_db
        
        user_oid = ObjectId()
        ws_oid = ObjectId()
        
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_oid,
            "email": "user@example.com"
        })
        mock_members.find_one = AsyncMock(return_value={
            "workspace_id": ws_oid,
            "user_id": user_oid,
            "role": "admin"
        })
        
        token = create_access_token(username="user@example.com", role="viewer", org="kubi-org", scopes=["sre:read"])
        headers = {"Authorization": f"Bearer {token}"}
        
        response = client.post(f"/api/workspaces/{ws_oid}/switch", headers=headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["workspace_id"], str(ws_oid))
        self.assertEqual(data["workspace_role"], "admin")
        self.assertIn("access_token", data)
        
        # Verify access token is upgraded to admin scopes
        from app.core.config import settings
        decoded = decode_jwt_token(data["access_token"], settings.JWT_SECRET_KEY)
        self.assertIn("admin", decoded["scopes"])
        self.assertEqual(decoded["workspace_id"], str(ws_oid))

if __name__ == '__main__':
    unittest.main()
