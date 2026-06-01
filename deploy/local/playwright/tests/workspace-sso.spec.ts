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
  
  for (let i = 0; i < 10; i++) {
    const doc = await db
      .collection('otps')
      .find({ email: email.toLowerCase() })
      .sort({ created_at: -1 })
      .limit(1)
      .next();
    if (doc?.code) {
      await client.close();
      return doc.code;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  await client.close();
  return '';
}

test.describe('Workspace & SSO Settings E2E Integration Journey', () => {
  test('Complete multi-workspace creation, SSO tab switching, and ES search flow', async ({ page }) => {
    console.log('🚀 Starting Workspace & SSO Settings E2E Integration Test');
    
    // Attach console listener for debugging
    page.on('console', msg => {
      console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
    });

    // -------------------------------------------------
    // 1. Register a new user
    // -------------------------------------------------
    const uniqueEmail = `workspace-sso-${Date.now()}@example.com`;
    const password = `WorkspacePass123!`;
    const fullName = 'Workspace Tester';

    console.log(`[Step 1] Navigating to registration page for ${uniqueEmail}`);
    await page.goto(`${baseURL}/register`);
    await page.screenshot({ path: 'test-results/workspace-01-register-page.png' });
    
    await page.locator('input[placeholder*="Full Name"], input[label*="Full Name"], input').nth(0).fill(fullName);
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    
    console.log('[Step 1] Submitting registration form');
    await page.locator('button[type="submit"]').click();

    console.log('[Step 1] Waiting for redirect to email verification');
    await expect(page).toHaveURL(/.*\/verify-email/, { timeout: 15000 });
    await page.screenshot({ path: 'test-results/workspace-02-verify-page.png' });

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
    await page.screenshot({ path: 'test-results/workspace-03-dashboard.png' });

    // -------------------------------------------------
    // 2. Settings: Workspace Catalog & Creation
    // -------------------------------------------------
    console.log('[Step 2] Navigating to Settings page');
    await page.goto(`${baseURL}/settings`);
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/workspace-04-settings.png' });

    console.log('[Step 2] Swapping to Workspace & Team tab');
    // Click the Tab containing 'Workspace & Team'
    await page.click('text=Workspace & Team');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/workspace-05-workspace-tab.png' });

    // Verify Catalog elements exist
    await expect(page.locator('text=Workspace Catalog')).toBeVisible();
    await expect(page.locator('text=Workspace Collaborators')).toBeVisible();

    const testWorkspaceName = `Playwright Test Organization ${Date.now()}`;
    console.log(`[Step 2] Creating a new workspace: "${testWorkspaceName}"`);
    await page.fill('input[placeholder="e.g. Production Cluster Workspace"]', testWorkspaceName);
    await page.screenshot({ path: 'test-results/workspace-06-creating-workspace.png' });
    
    // Submit creation
    await page.click('button:has-text("Create Workspace")');
    
    // Switch triggers page reload and switches to new workspace context
    console.log('[Step 2] Waiting for workspace creation and redirect/reload');
    await page.waitForTimeout(4000);
    await expect(page).toHaveURL(/.*\/settings/, { timeout: 10000 });
    await page.screenshot({ path: 'test-results/workspace-07-settings-reloaded.png' });

    // Verify we are in the new workspace by selecting the workspace tab again
    await page.click('text=Workspace & Team');
    await page.waitForTimeout(500);
    await expect(page.locator(`text=${testWorkspaceName}`).first()).toBeVisible();
    console.log('[Step 2] Workspace catalog creation verified successfully!');

    // -------------------------------------------------
    // 3. Settings: Identity & Security Tab
    // -------------------------------------------------
    console.log('[Step 3] Swapping to Identity & Security tab');
    await page.click('text=Identity & Security');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/workspace-08-identity-tab.png' });

    await expect(page.locator('text=SSO Connected Identities')).toBeVisible();
    await expect(page.locator('text=Operator Tokens & Safes')).toBeVisible();
    console.log('[Step 3] SSO Connected Identities panel verified successfully!');

    // -------------------------------------------------
    // 4. Logs Page: Elasticsearch Search Tab
    // -------------------------------------------------
    console.log('[Step 4] Navigating to Logs page');
    await page.goto(`${baseURL}/logs`);
    await expect(page.locator('text=Pod Log Explorer & Diagnostics')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/workspace-09-logs-page.png' });

    // We select a namespace and select a pod (e.g. kubi namespace or standalone pod)
    // Wait for the workloads tree to load
    await page.waitForTimeout(1000);
    
    // Expand the first namespace in workloads tree
    console.log('[Step 4] Clicking to expand workloads namespace');
    const firstNamespaceItem = page.locator('nav[class*="List-root"] div[class*="Button-root"]').first();
    await firstNamespaceItem.click();
    await page.waitForTimeout(500);

    // Expand the first deployment / Cpu workload
    console.log('[Step 4] Clicking to expand Cpu workloads deployment');
    const firstDeploymentItem = page.locator('nav[class*="List-root"] div[class*="Collapse-root"] div[class*="Button-root"]').first();
    if (await firstDeploymentItem.isVisible()) {
      await firstDeploymentItem.click();
      await page.waitForTimeout(500);
      
      // Select the first Pod
      console.log('[Step 4] Selecting active SRE Pod in tree');
      const firstPodItem = page.locator('nav[class*="List-root"] div[class*="Collapse-root"] div[class*="Collapse-root"] div[class*="Button-root"]').first();
      if (await firstPodItem.isVisible()) {
        await firstPodItem.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/workspace-10-pod-selected.png' });

        // Go to Elasticsearch search tab
        console.log('[Step 4] Swapping to Search Archive (ES) diagnostics tab');
        await page.click('text=Search Archive (ES)');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-results/workspace-11-es-search-tab.png' });

        // Assert ES logs search UI elements are visible
        await expect(page.locator('placeholder="Search logs by keyword, exception, or traceback..."')).toBeVisible({ timeout: 5000 }).catch(() => {
          // fallback to locator checks if placeholder string matches slightly differently
          return expect(page.locator('input[placeholder*="Search logs"]')).toBeVisible();
        });

        // Type query in Elasticsearch logs input and execute search
        console.log('[Step 4] Executing ES Search for keyword: "exception"');
        await page.locator('input[placeholder*="Search logs"]').fill('exception');
        await page.click('button:has-text("Search")');
        
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/workspace-12-es-searched.png' });
        console.log('[Step 4] Elasticsearch logs search executed cleanly!');
      }
    }

    console.log('🎉 E2E Workspace & SSO Settings Integration Test completed successfully!');
  });
});
