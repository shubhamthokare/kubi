import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from datetime import datetime
from bson import ObjectId

from main import app
from app.core.auth import decode_jwt_token
from app.core.password import hash_password

class TestPasswordAuth(unittest.TestCase):
    def setUp(self):
        from app.core.security import rate_limiter
        self.original_check = rate_limiter.check_rate_limit
        rate_limiter.check_rate_limit = MagicMock()

    def tearDown(self):
        from app.core.security import rate_limiter
        rate_limiter.check_rate_limit = self.original_check

    @patch('app.api.auth_routes._generate_code')
    @patch('app.api.auth_routes._store_otp')
    @patch('app.api.auth_routes.send_otp_email')
    @patch('app.api.auth_routes.get_db')
    def test_registration_flow_success(self, mock_get_db, mock_send_email, mock_store_otp, mock_gen_code):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_workspaces = MagicMock()
        mock_members = MagicMock()
        
        mock_db.__getitem__.side_effect = lambda name: {
            "users": mock_users,
            "workspaces": mock_workspaces,
            "workspace_members": mock_members
        }[name]
        mock_get_db.return_value = mock_db
        
        # Scenario: Registering a brand new user
        mock_users.find_one = AsyncMock(return_value=None)
        
        user_id = ObjectId()
        mock_users.insert_one = AsyncMock(return_value=MagicMock(inserted_id=user_id))
        
        ws_id = ObjectId()
        mock_workspaces.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ws_id))
        mock_members.insert_one = AsyncMock(return_value=MagicMock())
        
        mock_gen_code.return_value = "123456"
        mock_store_otp.return_value = None
        mock_send_email.return_value = True
        
        response = client.post(
            "/api/auth/register",
            json={
                "name": "Alice SRE",
                "email": "alice@kubi.ai",
                "password": "supersecurepassword123"
            }
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["user_id"], str(user_id))
        self.assertEqual(data["workspace_id"], str(ws_id))
        
        self.assertTrue(mock_users.insert_one.called)
        self.assertTrue(mock_workspaces.insert_one.called)
        self.assertTrue(mock_members.insert_one.called)
        self.assertTrue(mock_gen_code.called)
        self.assertTrue(mock_store_otp.called)
        self.assertTrue(mock_send_email.called)

    @patch('app.api.auth_routes.get_db')
    def test_registration_fail_duplicate_email(self, mock_get_db):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        
        mock_db.__getitem__.return_value = mock_users
        mock_get_db.return_value = mock_db
        
        # Scenario: Registering a user with an already existing email
        mock_users.find_one = AsyncMock(return_value={"_id": ObjectId(), "email": "alice@kubi.ai"})
        
        response = client.post(
            "/api/auth/register",
            json={
                "name": "Alice SRE",
                "email": "alice@kubi.ai",
                "password": "supersecurepassword123"
            }
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("already in use", response.json()["detail"])

    @patch('app.api.auth_routes.get_db')
    def test_login_flow_success(self, mock_get_db):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_members = MagicMock()
        
        mock_db.__getitem__.side_effect = lambda name: {
            "users": mock_users,
            "workspace_members": mock_members
        }[name]
        mock_get_db.return_value = mock_db
        
        user_id = ObjectId()
        ws_id = ObjectId()
        hashed_pwd = hash_password("supersecurepassword123")
        
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_id,
            "email": "alice@kubi.ai",
            "name": "Alice SRE",
            "hashed_password": hashed_pwd,
            "is_email_verified": True
        })
        
        mock_members.find_one = AsyncMock(return_value={
            "workspace_id": ws_id,
            "user_id": user_id,
            "role": "owner"
        })
        
        response = client.post(
            "/api/auth/login",
            json={
                "email": "alice@kubi.ai",
                "password": "supersecurepassword123"
            }
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["username"], "Alice SRE")
        self.assertEqual(data["workspace_id"], str(ws_id))
        self.assertEqual(data["workspace_role"], "owner")
        
        # Verify access token content
        from app.core.config import settings
        decoded = decode_jwt_token(data["access_token"], settings.JWT_SECRET_KEY)
        self.assertEqual(decoded["workspace_id"], str(ws_id))
        self.assertEqual(decoded["role"], "owner")
        self.assertIn("admin", decoded["scopes"])

    @patch('app.api.auth_routes._generate_code')
    @patch('app.api.auth_routes._store_otp')
    @patch('app.api.auth_routes.send_otp_email')
    @patch('app.api.auth_routes.get_db')
    def test_login_flow_fail_unverified(self, mock_get_db, mock_send_email, mock_store_otp, mock_gen_code):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        
        mock_db.__getitem__.return_value = mock_users
        mock_get_db.return_value = mock_db
        
        user_id = ObjectId()
        hashed_pwd = hash_password("supersecurepassword123")
        
        # SRE is unverified
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_id,
            "email": "alice@kubi.ai",
            "name": "Alice SRE",
            "hashed_password": hashed_pwd,
            "is_email_verified": False
        })
        
        mock_gen_code.return_value = "654321"
        mock_store_otp.return_value = None
        mock_send_email.return_value = True
        
        response = client.post(
            "/api/auth/login",
            json={
                "email": "alice@kubi.ai",
                "password": "supersecurepassword123"
            }
        )
        
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "email_not_verified")
        
        self.assertTrue(mock_gen_code.called)
        self.assertTrue(mock_store_otp.called)
        self.assertTrue(mock_send_email.called)

    @patch('app.api.auth_routes._verify_otp')
    @patch('app.api.auth_routes.get_db')
    def test_verify_email_success(self, mock_get_db, mock_verify_otp):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_members = MagicMock()
        
        mock_db.__getitem__.side_effect = lambda name: {
            "users": mock_users,
            "workspace_members": mock_members
        }[name]
        mock_get_db.return_value = mock_db
        
        user_id = ObjectId()
        ws_id = ObjectId()
        
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_id,
            "email": "alice@kubi.ai",
            "name": "Alice SRE",
            "is_email_verified": False
        })
        mock_users.update_one = AsyncMock(return_value=None)
        
        mock_members.find_one = AsyncMock(return_value={
            "workspace_id": ws_id,
            "user_id": user_id,
            "role": "owner"
        })
        
        mock_verify_otp.return_value = True
        
        response = client.post(
            "/api/auth/verify-email",
            json={
                "email": "alice@kubi.ai",
                "code": "123456"
            }
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["username"], "Alice SRE")
        self.assertEqual(data["workspace_id"], str(ws_id))
        
        mock_users.update_one.assert_called_once_with(
            {"_id": user_id},
            {"$set": {"is_email_verified": True}}
        )

    @patch('app.api.auth_routes._verify_otp')
    @patch('app.api.auth_routes.get_db')
    def test_verify_email_fail_invalid_otp(self, mock_get_db, mock_verify_otp):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        mock_verify_otp.return_value = False
        
        response = client.post(
            "/api/auth/verify-email",
            json={
                "email": "alice@kubi.ai",
                "code": "wrongcode"
            }
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid or expired verification code", response.json()["detail"])

    @patch('app.api.auth_routes.get_db')
    def test_login_fail_invalid_credentials(self, mock_get_db):
        client = TestClient(app)
        
        mock_db = MagicMock()
        mock_users = MagicMock()
        
        mock_db.__getitem__.return_value = mock_users
        mock_get_db.return_value = mock_db
        
        # 1. Non-existent user
        mock_users.find_one = AsyncMock(return_value=None)
        
        response = client.post(
            "/api/auth/login",
            json={
                "email": "wrong@kubi.ai",
                "password": "somepassword"
            }
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid email or password", response.json()["detail"])
        
        # 2. Correct user but wrong password
        user_id = ObjectId()
        hashed_pwd = hash_password("supersecurepassword123")
        mock_users.find_one = AsyncMock(return_value={
            "_id": user_id,
            "email": "alice@kubi.ai",
            "name": "Alice SRE",
            "hashed_password": hashed_pwd,
            "is_email_verified": True
        })
        
        response_wrong_pass = client.post(
            "/api/auth/login",
            json={
                "email": "alice@kubi.ai",
                "password": "wrongpassword"
            }
        )
        self.assertEqual(response_wrong_pass.status_code, 401)
        self.assertIn("Invalid email or password", response_wrong_pass.json()["detail"])

if __name__ == '__main__':
    unittest.main()
