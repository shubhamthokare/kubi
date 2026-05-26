import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env file manually to get APP_URL for this worker
let appURL = 'http://localhost:3000';
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim();
      if (key.trim() === 'APP_URL') {
        appURL = val;
        break;
      }
    }
  }
}

test.describe('Kubi AI Authentication UI Tests', () => {
  const APP_URL = process.env.APP_URL || appURL;

  test('Should render Login Page without SSO buttons', async ({ page }) => {
    // Navigate to login page
    console.log(`Navigating to login page at ${APP_URL}/login...`);
    await page.goto(`${APP_URL}/login`);

    // Verify brand title is visible
    await expect(page.locator('text=Kubi AI')).toBeVisible({ timeout: 15000 });

    // Verify standard Email and Password input fields are present
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify SSO buttons are NOT present
    await expect(page.locator('text=Sign in with Google Workspace')).not.toBeVisible();
    await expect(page.locator('text=Sign in with GitHub Enterprise')).not.toBeVisible();
    await expect(page.locator('text=Sign in with GitLab SRE')).not.toBeVisible();

    // Verify Register link is present
    await expect(page.locator('text=Don\'t have an SRE account?')).toBeVisible();
    await expect(page.locator('text=Sign Up')).toBeVisible();
  });

  test('Should validate blank credentials error feedback', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);

    // Click Sign In directly
    await page.click('button:has-text("Sign In")');

    // Email is required, so HTML5 form validation will prevent submission or standard feedback triggers
    const emailField = page.locator('input[type="email"]');
    await expect(emailField).toBeFocused();
  });

  test('Should perform registration, unverified login redirect, and verification using OTP', async ({ page }) => {
    const uniqueEmail = `sre-test-${Date.now()}@kubi.ai`;
    
    // ============================================================
    // 1. REGISTRATION FLOW
    // ============================================================
    console.log(`Registering new SRE: ${uniqueEmail}...`);
    await page.goto(`${APP_URL}/register`);
    
    await page.getByLabel(/Full Name/i).fill('Test SRE');
    await page.getByLabel(/Email Address/i).fill(uniqueEmail);
    await page.getByLabel(/^Password/i).first().fill('securePassword123');
    await page.getByLabel(/Confirm Password/i).fill('securePassword123');
    
    await page.click('button:has-text("Sign Up")');
    
    // Registration should redirect SRE to verify-email
    await page.waitForURL(/verify-email/, { timeout: 20000 });
    await expect(page.locator('text=Verify Your Email')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveValue(uniqueEmail);

    // ============================================================
    // 2. UNVERIFIED LOGIN FLOW (REDIRECT TO VERIFY SCREEN)
    // ============================================================
    console.log('Testing unverified SRE login attempt...');
    await page.goto(`${APP_URL}/login`);
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill('securePassword123');
    await page.click('button:has-text("Sign In")');
    
    // Login with unverified user should force redirect back to verify-email
    await page.waitForURL(/verify-email/, { timeout: 20000 });
    await expect(page.locator('text=Verify Your Email')).toBeVisible();

    // ============================================================
    // 3. INVALID OTP VALIDATION
    // ============================================================
    console.log('Testing invalid verification code entry...');
    await page.getByLabel(/Verification Code/i).fill('111111');
    await page.click('button:has-text("Verify Code")');
    
    // Expect error alert
    await expect(page.locator('text=Verification failed. Invalid or expired code.')).toBeVisible({ timeout: 15000 });

    // ============================================================
    // 4. VALID OTP FLOW
    // ============================================================
    console.log('Testing valid verification code ("000000" dev bypass) entry...');
    await page.getByLabel(/Verification Code/i).fill('000000');
    await page.click('button:has-text("Verify Code")');
    
    // Expect transition to dashboard
    await page.waitForURL(/dashboard/, { timeout: 25000 });
    console.log('SRE OTP Email Verification integration test completed successfully!');
  });
});
