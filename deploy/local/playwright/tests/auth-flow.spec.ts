// deploy/playwright/tests/auth-flow.spec.ts
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';

// Load environment variables from the .env file in the same folder
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseURL = process.env.APP_URL || 'http://localhost:3000';
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

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

if (!testEmail || !testPassword) {
  console.warn('TEST_USER_EMAIL or TEST_USER_PASSWORD not set – some tests will be skipped.');
}

test.describe('Authentication Journey', () => {
  test('Login with existing user', async ({ page }) => {
    test.skip(!testEmail || !testPassword, 'Missing test credentials');
    await page.goto(`${baseURL}/login`);
    
    // Fill credentials using robust labels
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Successful login should redirect to the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Cluster Overview')).toBeVisible();
  });

  test('Register + OTP verification + login', async ({ page }) => {
    // Use a unique email for each run to avoid collisions
    const uniqueEmail = `playwright-${Date.now()}@example.com`;
    const pwd = `TestPass${Date.now()}!`;
    await page.goto(`${baseURL}/register`);
    
    // Fill registration fields using robust labels
    await page.getByLabel('Full Name').fill('Playwright Test');
    await page.getByLabel('Email Address').fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill(pwd);
    await page.getByLabel('Confirm Password').fill(pwd);
    await page.getByRole('button', { name: 'Sign Up' }).click();
    
    // Wait for redirect to verification screen
    await expect(page).toHaveURL(/.*\/verify-email/);
    
    // Retrieve OTP from MongoDB dynamically
    await page.waitForTimeout(2000);
    const otp = await getLatestOtp(uniqueEmail);
    console.log(`Retrieved dynamic OTP for ${uniqueEmail}: ${otp}`);
    
    // Fill verification code using label
    await page.getByLabel('Verification Code (6-Digit OTP)').fill(otp);
    await page.getByRole('button', { name: 'Verify Code' }).click();
    
    // After verification, should be logged in and land on dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Cluster Overview')).toBeVisible();
  });
});
