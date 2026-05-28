import { test, expect, request } from '@playwright/test';
import { MongoClient } from 'mongodb';

/**
 * Helper to fetch the latest OTP for a given email directly from MongoDB.
 * This is intended for test purposes only.
 */
async function getLatestOtp(email: string): Promise<string> {
  const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db('kubi');
  const doc = await db
    .collection('otps')
    .find({ email })
    .sort({ created_at: -1 })
    .limit(1)
    .next();
  await client.close();
  return doc?.code ?? '';
}

/**
 * Playwright end‑to‑end test that registers a user, verifies the email via OTP,
 * and then logs in, asserting that an access token is returned.
 */
test('register → verify → login user flow', async ({ request }) => {
  const baseUrl = process.env.KUBI_BACKEND_URL ?? 'http://localhost:8001';

  // Unique user for the test run
  const email = `playwright_ts_${Date.now()}@example.com`;
  const password = 'StrongPass!789';
  const name = 'Playwright TS';

  // -------------------------------------------------
  // 1. Register user
  // -------------------------------------------------
  const registerRes = await request.post(`${baseUrl}/api/auth/register`, {
    data: { email, name, password },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(registerRes.status()).toBe(200);
  const registerBody = await registerRes.json();
  expect(registerBody.status).toBe('success');

  // -------------------------------------------------
  // 2. Use dummy OTP for test environment
  // -------------------------------------------------
  const otp = '123456'; // dummy OTP


  // -------------------------------------------------
  // 3. Verify email with OTP
  // -------------------------------------------------
  const verifyRes = await request.post(`${baseUrl}/api/auth/verify-email`, {
    data: { email, code: otp },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(verifyRes.status()).toBe(200);

  // -------------------------------------------------
  // 4. Login with verified credentials
  // -------------------------------------------------
  const loginRes = await request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  expect(loginBody).toHaveProperty('access_token');
});
