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

test.describe('SRE Ingestion Hub E2E Integration Journey', () => {
  test('Complete simulated incident injection and webhook propagation flow', async ({ page }) => {
    console.log('🚀 Starting SRE Ingestion Hub E2E Integration Test');
    
    // Attach console listener for debugging
    page.on('console', msg => {
      console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
    });

    // -------------------------------------------------
    // 1. Register a new user
    // -------------------------------------------------
    const uniqueEmail = `ingest-tester-${Date.now()}@example.com`;
    const password = `IngestPass123!`;
    const fullName = 'Ingest Sandbox Tester';

    console.log(`[Step 1] Navigating to registration page for ${uniqueEmail}`);
    await page.goto(`${baseURL}/register`);
    await page.screenshot({ path: 'test-results/ingest-01-register-page.png' });
    
    await page.locator('input[placeholder*="Full Name"], input[label*="Full Name"], input').nth(0).fill(fullName);
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    
    console.log('[Step 1] Submitting registration form');
    await page.locator('button[type="submit"]').click();

    console.log('[Step 1] Waiting for redirect to email verification');
    await expect(page).toHaveURL(/.*\/verify-email/, { timeout: 15000 });
    await page.screenshot({ path: 'test-results/ingest-02-verify-page.png' });

    console.log('[Step 1] Retrieving OTP from MongoDB');
    await page.waitForTimeout(3000);
    const signupOtp = await getLatestOtp(uniqueEmail);
    console.log(`[Step 1] Retrieved OTP: ${signupOtp}`);
    expect(signupOtp).not.toBe('');

    console.log('[Step 1] Submitting email verification');
    await page.getByLabel('Verification Code (6-Digit OTP)').fill(signupOtp);
    await page.getByRole('button', { name: 'Verify Code' }).click();

    console.log('[Step 1] Waiting for redirect to dashboard');
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });
    console.log('[Step 1] User successfully logged in!');

    // -------------------------------------------------
    // 2. Navigate to Ingestion Hub
    // -------------------------------------------------
    console.log('[Step 2] Navigating to Incidents page');
    await page.goto(`${baseURL}/incidents`);
    await expect(page.locator('text=Incident Management')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/ingest-03-incidents-page.png' });

    console.log('[Step 2] Clicking Ingestion Hub button to navigate to Sandbox');
    await page.click('text=Ingestion Hub');
    
    console.log('[Step 2] Waiting for redirect to /incidents/ingest');
    await expect(page).toHaveURL(/.*\/incidents\/ingest/, { timeout: 10000 });
    await expect(page.locator('text=Webhook Ingestion & Simulation Hub')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/ingest-04-ingestion-hub.png' });

    // -------------------------------------------------
    // 3. Trigger simulated incident injection
    // -------------------------------------------------
    const uniquePodName = `simulated-oom-pod-${Date.now()}`;
    console.log(`[Step 3] Configuring simulated OutOfMemory alert for pod: "${uniquePodName}"`);
    
    // Select Alert Type: OutOfMemory
    await page.click('label:has-text("Anomaly Type") + div');
    await page.click('li[data-value="OutOfMemory"]');
    await page.waitForTimeout(300);

    // Update Pod Name
    await page.getByLabel('Simulated Pod Name').fill(uniquePodName);
    
    // Update Diagnostic Message
    const uniqueMessage = `OutOfMemoryError test dispatch at ${new Date().toLocaleTimeString()}`;
    await page.getByLabel('Diagnostic Message').fill(uniqueMessage);
    
    await page.screenshot({ path: 'test-results/ingest-05-sandbox-configured.png' });

    console.log('[Step 3] Clicking "Inject Simulated Incident"');
    await page.click('button:has-text("Inject Simulated Incident")');
    
    console.log('[Step 3] Waiting for server API response to render');
    await expect(page.locator('text=Server API Response')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=HTTP STATUS 200 OK')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/ingest-06-api-response.png' });

    // -------------------------------------------------
    // 4. Verify Live Audit Logs & Incidents Propagation
    // -------------------------------------------------
    console.log('[Step 4] Verifying simulated alert in delivery live audit trail');
    await expect(page.locator(`text=${uniquePodName}`)).toBeVisible({ timeout: 10000 });
    
    console.log('[Step 4] Navigating back to main Incidents Management screen');
    await page.goto(`${baseURL}/incidents`);
    await expect(page.locator('text=Incident Management')).toBeVisible({ timeout: 10000 });
    
    console.log('[Step 4] Verifying the new incident is listed on the dashboard');
    await expect(page.locator(`text=${uniquePodName}`).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'test-results/ingest-07-incidents-propagated.png' });

    console.log('🎉 E2E Ingestion Hub & Webhook Simulation Journey completed successfully!');
  });
});
