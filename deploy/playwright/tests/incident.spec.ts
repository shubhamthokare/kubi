import { test, expect } from '@playwright/test';

test.describe('AI Incident Recovery Flow - Antigravity Browser Control', () => {

  test('Complete Kubernetes Incident Lifecycle Automation', async ({ page }) => {

    // ============================================================
    // CONFIG
    // ============================================================

    const APP_URL = process.env.APP_URL || 'http://localhost:3000';
    const CLUSTER_NAME = 'kubeguard-test-cluster';
    const NAMESPACE = 'incident-test';
    const FAILING_DEPLOYMENT = 'failing-nginx';

    // ============================================================
    // OPEN APPLICATION
    // ============================================================

    await page.goto(APP_URL);
    await page.waitForTimeout(1000); // Visual pause after page load

    await expect(page.locator('text=Kubi').first()).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 1 — CREATE CLUSTER CONNECTION
    // No cluster connected on fresh docker deployment
    // ============================================================

    console.log('Creating Kubernetes cluster connection...');

    await page.click('button:has-text("Cluster Connection")');
    await page.waitForTimeout(500);

    await page.fill('input[name="clusterName"]', CLUSTER_NAME);
    await page.waitForTimeout(300);

    await page.selectOption('select[name="provider"]', 'minikube');
    await page.waitForTimeout(300);

    await page.fill(
      'textarea[name="kubeconfig"]',
      process.env.KUBECONFIG_CONTENT || ''
    );
    await page.waitForTimeout(500);

    await page.click('button:has-text("Connect Cluster")');
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Cluster connected successfully')
    ).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);

    // ============================================================
    // STEP 2 — CREATE FAILING POD SCENARIO
    // ============================================================

    console.log('Creating failing pod scenario...');

    await page.click('button:has-text("Create Test Incident")');
    await page.waitForTimeout(500);

    await page.fill(
      'input[name="deploymentName"]',
      FAILING_DEPLOYMENT
    );
    await page.waitForTimeout(300);

    await page.selectOption(
      'select[name="incidentType"]',
      'CrashLoopBackOff'
    );
    await page.waitForTimeout(300);

    await page.fill(
      'textarea[name="manifest"]',
      `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: failing-nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: failing-nginx
  template:
    metadata:
      labels:
        app: failing-nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        command: ["sh", "-c", "exit 1"]
`
    );
    await page.waitForTimeout(500);

    await page.click('button:has-text("Deploy Incident")');
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Deployment created')
    ).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);

    // ============================================================
    // STEP 3 — VERIFY INCIDENT DETECTION
    // ============================================================

    console.log('Waiting for incident detection...');

    await expect(
      page.locator('text=CrashLoopBackOff detected')
    ).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await expect(
      page.locator(`text=${FAILING_DEPLOYMENT}`)
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 4 — CHECK PREVIOUS INCIDENT HISTORY
    // ============================================================

    console.log('Checking historical incidents...');

    await expect(
      page.locator('text=Searching historical incidents')
    ).toBeVisible();
    await page.waitForTimeout(1000);

    const previousIncident = page.locator(
      'text=Similar incident found'
    );

    if (await previousIncident.isVisible()) {

      await expect(
        page.locator('text=Sending logs to Gemini')
      ).toBeVisible();
      await page.waitForTimeout(500);

      await expect(
        page.locator('text=Historical RCA attached')
      ).toBeVisible();
      await page.waitForTimeout(500);
    }

    // ============================================================
    // STEP 5 — GEMINI LOG & EVENT ANALYSIS
    // ============================================================

    console.log('Waiting for Gemini analysis...');

    await expect(
      page.locator('text=Gemini analyzing logs')
    ).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Root Cause Analysis Complete')
    ).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=CrashLoopBackOff caused by invalid startup command')
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 6 — GEMINI REMEDIATION GENERATION
    // ============================================================

    console.log('Validating remediation generation...');

    await expect(
      page.locator('text=Generating remediation')
    ).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Suggested Fix')
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 7 — GITLAB MCP RULE ENGINE
    // ============================================================

    console.log('Checking remediation automation rules...');

    const autoApplySection = page.locator(
      'text=Eligible for GitLab MCP auto-remediation'
    );

    const approvalSection = page.locator(
      'text=Approval Required'
    );

    if (await autoApplySection.isVisible()) {

      console.log('Auto remediation flow');

      await expect(
        page.locator('text=Executing GitLab MCP pipeline')
      ).toBeVisible();
      await page.waitForTimeout(1000);

      await expect(
        page.locator('text=Merge Request Created')
      ).toBeVisible({ timeout: 120000 });
      await page.waitForTimeout(1000);

      await expect(
        page.locator('text=Remediation Applied')
      ).toBeVisible({ timeout: 120000 });
      await page.waitForTimeout(1000);

    } else if (await approvalSection.isVisible()) {

      console.log('Manual approval flow');

      await expect(
        page.locator('text=Approval request created')
      ).toBeVisible();
      await page.waitForTimeout(1000);

      await page.click('button:has-text("Approve")');
      await page.waitForTimeout(1000);

      await expect(
        page.locator('text=GitLab MCP execution started')
      ).toBeVisible();
      await page.waitForTimeout(1000);

      await expect(
        page.locator('text=Remediation Applied')
      ).toBeVisible({ timeout: 120000 });
      await page.waitForTimeout(1000);
    }

    // ============================================================
    // STEP 8 — VERIFY INCIDENT RESOLUTION
    // ============================================================

    console.log('Validating recovery...');

    await expect(
      page.locator('text=Incident Resolved')
    ).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Pod Healthy')
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 9 — VERIFY GEMINI POST-INCIDENT REPORT
    // ============================================================

    console.log('Checking incident report generation...');

    await expect(
      page.locator('text=Generating Incident Report')
    ).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=Incident Report Generated')
    ).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=What Happened')
    ).toBeVisible();
    await page.waitForTimeout(500);

    await expect(
      page.locator('text=Why It Happened')
    ).toBeVisible();
    await page.waitForTimeout(500);

    await expect(
      page.locator('text=Resolution Steps')
    ).toBeVisible();
    await page.waitForTimeout(500);

    await expect(
      page.locator('text=Prevention Recommendations')
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 10 — VERIFY MONGODB STORAGE
    // ============================================================

    console.log('Checking MongoDB persistence...');

    await expect(
      page.locator('text=Report stored in MongoDB')
    ).toBeVisible();
    await page.waitForTimeout(500);

    // ============================================================
    // STEP 11 — CLEANUP ALL RESOURCES
    // ============================================================

    console.log('Cleaning test resources...');

    await page.click('button:has-text("Cleanup Resources")');
    await page.waitForTimeout(500);

    await page.click('button:has-text("Confirm Cleanup")');
    await page.waitForTimeout(1000);

    await expect(
      page.locator('text=All resources destroyed')
    ).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(1000);

    // ============================================================
    // FINAL ASSERTION
    // ============================================================

    await expect(
      page.locator('text=No Active Incidents')
    ).toBeVisible();
    await page.waitForTimeout(500);

    console.log('End-to-end incident automation test completed successfully.');
  });
});