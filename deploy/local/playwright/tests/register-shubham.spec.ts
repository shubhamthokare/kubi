import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseURL = process.env.APP_URL || 'http://localhost:3000';

async function cleanupAndGetDb() {
  const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27018';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db('kubi');
  
  // Clean up any existing records
  console.log('🧹 [DB] Cleaning up existing shubham@gmail.com records');
  await db.collection('users').deleteMany({ email: 'shubham@gmail.com' });
  await db.collection('otps').deleteMany({ email: 'shubham@gmail.com' });
  
  await client.close();
}

async function getLatestOtp(email: string): Promise<string> {
  const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27018';
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

test('Register and Verify User shubham@gmail.com', async ({ page }) => {
  console.log('🚀 [Browser] Starting shubham@gmail.com Registration & Verification Flow');
  
  // Capture browser console logs and errors
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  // 1. Database Cleanup
  await cleanupAndGetDb();

  // 2. Navigate to Register Page
  await page.goto(`${baseURL}/register`);
  await expect(page).toHaveURL(/.*\/register/);
  
  // 3. Fill Register Form
  console.log('✍️ [Browser] Filling out registration form');
  await page.locator('input[placeholder*="Full Name"], input[label*="Full Name"], input').nth(0).fill('Shubham');
  await page.locator('input[type="email"]').fill('shubham@gmail.com');
  await page.locator('input[type="password"]').first().fill('12345679@mE');
  await page.locator('input[type="password"]').nth(1).fill('12345679@mE');
  
  // 4. Submit Registration
  await page.locator('button[type="submit"]').click();

  // 5. Wait for Email Verification redirect
  console.log('⏳ [Browser] Waiting for redirect to email verification');
  await expect(page).toHaveURL(/.*\/verify-email/, { timeout: 15000 });

  // 6. Retrieve OTP code
  await page.waitForTimeout(3000);
  const otp = await getLatestOtp('shubham@gmail.com');
  console.log(`🔑 [DB] Retrieved OTP verification code: ${otp}`);
  expect(otp).not.toBe('');

  // 7. Submit Verification Code
  console.log('🔐 [Browser] Submitting email verification code');
  await page.getByLabel('Verification Code (6-Digit OTP)').fill(otp);
  await page.getByRole('button', { name: 'Verify Code' }).click();

  // 8. Confirm Dashboard Redirect
  console.log('🎉 [Browser] Waiting for dashboard redirect');
  await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });
  await expect(page.locator('text=Cluster Overview')).toBeVisible({ timeout: 10000 });
  
  console.log('✅ [Browser] Registration and verification completed successfully!');
});
