import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';

// Load environment variables from the .env file in the same folder
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseURL = process.env.APP_URL || 'http://localhost:3000';

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

test.describe('User Lifecycle integration Journey', () => {
  test('Complete lifecycle: register, verify, forgot password, reset password, delete account', async ({ page }) => {
    console.log('🚀 Starting E2E User Lifecycle Integration Test');
    
    // -------------------------------------------------
    // 1. Register a new user
    // -------------------------------------------------
    const uniqueEmail = `lifecycle-${Date.now()}@example.com`;
    const initialPassword = `InitPassWord${Date.now()}!`;
    const newPassword = `NewPassWord${Date.now()}!`;
    const fullName = 'Lifecycle Test User';

    console.log(`[Step 1] Navigating to registration page for ${uniqueEmail}`);
    await page.goto(`${baseURL}/register`);
    await page.screenshot({ path: 'test-results/debug-01-register-page.png' });
    
    await page.locator('input[placeholder*="Full Name"], input[label*="Full Name"], input').nth(0).fill(fullName);
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill(initialPassword);
    await page.locator('input[type="password"]').nth(1).fill(initialPassword);
    
    console.log('[Step 1] Submitting registration form');
    await page.screenshot({ path: 'test-results/debug-02-register-filled.png' });
    await page.locator('button[type="submit"]').click();

    console.log('[Step 1] Waiting for redirect to email verification');
    await expect(page).toHaveURL(/.*\/verify-email/, { timeout: 15000 });
    await page.screenshot({ path: 'test-results/debug-03-verify-page.png' });

    console.log('[Step 1] Retrieving OTP from MongoDB');
    await page.waitForTimeout(3000);
    const signupOtp = await getLatestOtp(uniqueEmail);
    console.log(`[Step 1] Retrieved signup OTP: ${signupOtp}`);
    expect(signupOtp).not.toBe('');

    console.log('[Step 1] Submitting email verification');
    await page.getByLabel('Verification Code (6-Digit OTP)').fill(signupOtp);
    await page.getByRole('button', { name: 'Verify Code' }).click();

    console.log('[Step 1] Waiting for redirect to dashboard');
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });
    await expect(page.locator('text=Cluster Overview')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-04-dashboard.png' });
    console.log('[Step 1] Successfully reached dashboard!');

    // Log out to test forgot password
    console.log('[Step 2] Logging out user (clearing localStorage and navigating to login)');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto(`${baseURL}/login`);
    await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-05-login-page.png' });
    console.log('[Step 2] Successfully logged out and verified on /login');

    // -------------------------------------------------
    // 2. Forgot Password workflow
    // -------------------------------------------------
    console.log('[Step 2] Clicking Forgot Password link');
    await page.locator('a[href="/forgot-password"]').click();
    await expect(page).toHaveURL(/.*\/forgot-password/, { timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-06-forgot-page.png' });

    console.log('[Step 2] Submitting request for password reset OTP');
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.screenshot({ path: 'test-results/debug-07-forgot-filled.png' });
    await page.locator('button[type="submit"]').click();

    console.log('[Step 2] Waiting for verification code inputs to show');
    await expect(page.locator('text=Enter the verification code sent to your email')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'test-results/debug-08-reset-page.png' });

    console.log('[Step 2] Retrieving reset password OTP from MongoDB');
    await page.waitForTimeout(3000);
    const resetOtp = await getLatestOtp(uniqueEmail);
    console.log(`[Step 2] Retrieved reset OTP: ${resetOtp}`);
    expect(resetOtp).not.toBe('');

    console.log('[Step 2] Submitting new password reset form');
    await page.getByLabel('Verification Code (6-Digit OTP)').fill(resetOtp);
    await page.getByLabel('New Password').fill(newPassword);
    await page.screenshot({ path: 'test-results/debug-09-reset-filled.png' });
    await page.getByRole('button', { name: 'Reset Password' }).click();

    console.log('[Step 2] Waiting for redirect to /login');
    await expect(page).toHaveURL(/.*\/login/, { timeout: 15000 });
    console.log('[Step 2] Password reset succeeded, back on login page!');

    console.log('[Step 2] Logging in with new password credentials');
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill(newPassword);
    await page.screenshot({ path: 'test-results/debug-10-login-with-new.png' });
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });
    await expect(page.locator('text=Cluster Overview')).toBeVisible({ timeout: 10000 });
    console.log('[Step 2] Successfully logged in using the new password!');

    // -------------------------------------------------
    // 3. Delete Account workflow
    // -------------------------------------------------
    console.log('[Step 3] Navigating to Settings page');
    await page.goto(`${baseURL}/settings`);
    await expect(page.locator('text=Danger Zone')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-11-settings-page.png' });

    console.log('[Step 3] Clicking Delete Account to trigger Dialog');
    await page.getByRole('button', { name: 'Delete Account' }).click();

    console.log('[Step 3] Confirming account deletion inside Material UI Dialog');
    await expect(page.locator('text=Delete Account Permanently?')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-12-delete-dialog.png' });

    // Click the actual confirmed Delete Account button inside the dialog actions
    await page.locator('button:has-text("Delete Account")').nth(1).click();

    console.log('[Step 3] Waiting for automatic redirect back to /register');
    await expect(page).toHaveURL(/.*\/register/, { timeout: 15000 });
    console.log('[Step 3] Account deletion cascading cleanup succeeded!');

    console.log('[Step 3] Verifying deleted credentials are now refused login');
    await page.goto(`${baseURL}/login`);
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill(newPassword);
    await page.locator('button[type="submit"]').click();

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
    console.log('🎉 E2E User Lifecycle Integration Test PASSED successfully!');
  });
});
