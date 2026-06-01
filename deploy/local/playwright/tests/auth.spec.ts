import { test, expect, request } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';

// Load environment variables from the .env file in the same folder
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
 * Clean up database records created for a test user.
 */
async function cleanupUser(email: string): Promise<void> {
  const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db('kubi');
  
  const user = await db.collection('users').findOne({ email });
  if (user) {
    await db.collection('workspace_members').deleteMany({
      $or: [
        { user_id: user._id },
        { user_id: user._id.toString() }
      ]
    });
    await db.collection('workspaces').deleteMany({
      $or: [
        { owner_id: user._id },
        { owner_id: user._id.toString() }
      ]
    });
    await db.collection('users').deleteOne({ _id: user._id });
  }
  await db.collection('otps').deleteMany({ email });
  await client.close();
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

  try {
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
    // 2. Retrieve the OTP from the database
    // -------------------------------------------------
    const otp = await getLatestOtp(email);
    expect(otp).not.toBe('');


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
  } finally {
    await cleanupUser(email);
  }
});
