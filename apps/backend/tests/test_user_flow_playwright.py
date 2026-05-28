import pytest
from playwright.sync_api import sync_playwright
import os
import time
import json
from motor.motor_asyncio import AsyncIOMotorClient

# Helper to fetch the latest OTP from the database (for test purposes only)
async def get_latest_otp(email: str) -> str:
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    db = client["kubi"]
    otp_doc = await db["otps"].find_one({"email": email}, sort=[("created_at", -1)])
    await client.close()
    return otp_doc["code"] if otp_doc else ""

@pytest.fixture(scope="session")
def playwright_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        yield context
        context.close()
        browser.close()

BASE_URL = os.getenv("KUBI_BACKEND_URL", "http://localhost:8000")

def test_register_verify_login(playwright_context):
    context = playwright_context
    page = context.new_page()
    # -------------------------------------------------
    # 1. Register a new user via the API endpoint
    # -------------------------------------------------
    register_payload = {
        "email": "playwright_test@example.com",
        "name": "Playwright Test",
        "password": "StrongPass!123"
    }
    response = page.request.post(f"{BASE_URL}/auth/register", data=json.dumps(register_payload), headers={"Content-Type": "application/json"})
    assert response.status == 200, f"Register failed: {response.text()}"
    data = response.json()
    assert data["status"] == "success"

    # -------------------------------------------------
    # 2. Retrieve the OTP that was sent during registration
    # -------------------------------------------------
    # In a real UI flow the OTP would be read from email. Here we fetch it directly from DB.
    otp_code = pytest.run(asyncio.get_event_loop().run_until_complete(get_latest_otp(register_payload["email"])))
    assert otp_code, "OTP not found for newly registered user"

    # -------------------------------------------------
    # 3. Verify the email using the OTP
    # -------------------------------------------------
    verify_payload = {
        "email": register_payload["email"],
        "code": otp_code
    }
    response = page.request.post(f"{BASE_URL}/auth/verify-email", data=json.dumps(verify_payload), headers={"Content-Type": "application/json"})
    assert response.status == 200, f"Email verification failed: {response.text()}"

    # -------------------------------------------------
    # 4. Login with the verified credentials
    # -------------------------------------------------
    login_payload = {
        "email": register_payload["email"],
        "password": register_payload["password"]
    }
    response = page.request.post(f"{BASE_URL}/auth/login", data=json.dumps(login_payload), headers={"Content-Type": "application/json"})
    assert response.status == 200, f"Login failed: {response.text()}"
    login_data = response.json()
    assert "access_token" in login_data
    # Optionally, you can decode the JWT to assert claims, but that is out of scope for this UI test.

    page.close()
