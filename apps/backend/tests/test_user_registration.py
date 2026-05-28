# tests for user registration endpoint
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from main import app

class TestUserRegistration(unittest.TestCase):
    def setUp(self):
        # Ensure a clean mock environment for each test
        pass

    @patch('app.api.auth_routes.send_otp_email')
    @patch('app.api.auth_routes.get_db')
    def test_register_successful(self, mock_get_db, mock_send_email):
        client = TestClient(app)
        # Mock the async database collection methods
        mock_db = MagicMock()
        # users collection
        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=None)  # email not existing
        mock_users.insert_one = AsyncMock(return_value=MagicMock(inserted_id='user123'))
        mock_db.__getitem__.return_value = mock_users
        # workspaces collection
        mock_workspaces = MagicMock()
        mock_workspaces.insert_one = AsyncMock(return_value=MagicMock(inserted_id='ws123'))
        # workspace_members collection
        mock_members = MagicMock()
        mock_members.insert_one = AsyncMock()
        # Assign collections based on name
        def get_collection(name):
            if name == 'users':
                return mock_users
            if name == 'workspaces':
                return mock_workspaces
            if name == 'workspace_members':
                return mock_members
            return MagicMock()
        mock_db.__getitem__.side_effect = get_collection
        mock_get_db.return_value = mock_db
        # Mock OTP generation and storage functions
        with patch('app.api.auth_routes._generate_code', return_value='123456'):
            with patch('app.api.auth_routes._store_otp', AsyncMock()):
                payload = {
                    "email": "test@example.com",
                    "name": "Test User",
                    "password": "StrongPass!123"
                }
                response = client.post('/api/auth/register', json=payload)
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data['status'], 'success')
                self.assertIn('user_id', data)
                self.assertIn('workspace_id', data)
                # Verify OTP email was attempted
                mock_send_email.assert_called_once()

if __name__ == '__main__':
    unittest.main()
