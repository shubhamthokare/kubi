import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Kubernetes Multi-Cluster Connectivity Verification', () => {
  const APP_URL = process.env.APP_URL || 'http://localhost:3000';

  test('Should validate all 3 connection methods successfully from UI', async ({ page }) => {
    // Attach console listener for debugging frontend/backend interactions
    page.on('console', msg => {
      console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
    });

    // ============================================================
    // 1. LOAD MINIKUBE CERTIFICATES
    // ============================================================
    const caPath = 'C:\\Users\\shubh\\.minikube\\ca.crt';
    const certPath = 'C:\\Users\\shubh\\.minikube\\profiles\\minikube\\client.crt';
    const keyPath = 'C:\\Users\\shubh\\.minikube\\profiles\\minikube\\client.key';

    let caCert = '';
    let clientCert = '';
    let clientKey = '';
    let caB64 = '';
    let certB64 = '';
    let keyB64 = '';

    if (fs.existsSync(caPath) && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      caCert = fs.readFileSync(caPath, 'utf8').trim();
      clientCert = fs.readFileSync(certPath, 'utf8').trim();
      clientKey = fs.readFileSync(keyPath, 'utf8').trim();

      caB64 = Buffer.from(caCert).toString('base64');
      certB64 = Buffer.from(clientCert).toString('base64');
      keyB64 = Buffer.from(clientKey).toString('base64');
      console.log('Successfully loaded and base64-encoded Minikube certificates.');
    } else {
      console.warn('Warning: Minikube certificates not found on standard paths!');
    }

    // ============================================================
    // 2. NAVIGATE TO CONFIGURATION PAGE
    // ============================================================
    console.log(`Navigating to configure page at ${APP_URL}/dashboard/configure...`);
    await page.goto(`${APP_URL}/dashboard/configure`);

    // Assert that the page header is visible
    await expect(page.locator('text=Kubi Multi-Cluster Hub')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000); // Visual pause after page load

    // ============================================================
    // METHOD 1 — KUBI IN-CLUSTER AGENT
    // ============================================================
    const agentClusterName = 'Playwright-Agent-Cluster';
    console.log(`Testing Method 1: Kubi In-Cluster Agent (${agentClusterName})...`);

    // Open Register Cluster dialog
    await page.click('button:has-text("Register Cluster")');
    await page.waitForTimeout(500);

    // Fill Cluster Name
    await page.fill('input[placeholder="e.g. Production Cluster"]', agentClusterName);
    await page.waitForTimeout(300);

    // Click Connection Method "Kubi In-Cluster Agent" to ensure it's active
    await page.click('text=Kubi In-Cluster Agent');
    await page.waitForTimeout(300);

    // Fill Agent URL
    await page.fill('input[placeholder="e.g. http://10.96.0.45:8080"]', 'http://kubi-agent-service:8080');
    await page.waitForTimeout(500);

    // Save Cluster
    await page.click('button:has-text("Save Cluster")');

    // Assert cluster is registered in the list
    await expect(page.locator(`text=${agentClusterName}`).first()).toBeVisible({ timeout: 10000 });

    // Assert connection status transitions to "Connected"
    const agentRow = page.locator('.MuiPaper-root', { has: page.locator(`text=${agentClusterName}`) }).first();
    await expect(agentRow.locator('text=Connected').first()).toBeVisible({ timeout: 45000 });
    console.log('Method 1 (Agent URL) validated successfully!');

    // ============================================================
    // METHOD 2 — DIRECT CREDENTIALS (TLS API Server)
    // ============================================================
    const directClusterName = 'Playwright-Direct-Cluster';
    console.log(`Testing Method 2: Direct Credentials (${directClusterName})...`);

    // Open Register Cluster dialog
    await page.click('button:has-text("Register Cluster")');
    await page.waitForTimeout(500);

    // Fill Cluster Name
    await page.fill('input[placeholder="e.g. Production Cluster"]', directClusterName);
    await page.waitForTimeout(300);

    // Select "Kubernetes API TLS" connection method
    await page.click('text=Kubernetes API TLS');
    await page.waitForTimeout(300);

    // Fill Endpoint URL
    await page.fill('input[placeholder="e.g. https://192.168.49.2:8443"]', 'https://kubernetes.default.svc');
    await page.waitForTimeout(300);

    // Paste cert contents using helper container locator mapping
    if (caCert && clientCert && clientKey) {
      const certTextareas = page.locator('textarea:not([readonly])');
      await certTextareas.nth(0).fill(caCert);
      await page.waitForTimeout(200);
      await certTextareas.nth(1).fill(clientCert);
      await page.waitForTimeout(200);
      await certTextareas.nth(2).fill(clientKey);
      await page.waitForTimeout(500);
    } else {
      console.warn('Skipping cert field filling due to missing cert files.');
    }

    // Save Cluster
    await page.click('button:has-text("Save Cluster")');

    // Assert cluster is registered in the list
    await expect(page.locator(`text=${directClusterName}`).first()).toBeVisible({ timeout: 10000 });

    // Assert connection status transitions to "Connected"
    const directRow = page.locator('.MuiPaper-root', { has: page.locator(`text=${directClusterName}`) }).first();
    await expect(directRow.locator('text=Connected').first()).toBeVisible({ timeout: 45000 });
    console.log('Method 2 (Direct TLS) validated successfully!');

    // ============================================================
    // METHOD 3 — KUBECONFIG FILE UPLOAD
    // ============================================================
    const kubeconfigClusterName = 'Playwright-Kubeconfig-Cluster';
    console.log(`Testing Method 3: Kubeconfig Upload (${kubeconfigClusterName})...`);

    // Open Register Cluster dialog
    await page.click('button:has-text("Register Cluster")');
    await page.waitForTimeout(500);

    // Fill Cluster Name
    await page.fill('input[placeholder="e.g. Production Cluster"]', kubeconfigClusterName);
    await page.waitForTimeout(300);

    // Select "Direct Kubeconfig File" connection method
    await page.click('text=Direct Kubeconfig File');
    await page.waitForTimeout(300);

    // Construct dynamic kubeconfig string
    const kubeconfigStr = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://kubernetes.default.svc
    certificate-authority-data: ${caB64}
  name: dynamic-cluster
contexts:
- context:
    cluster: dynamic-cluster
    user: dynamic-user
    namespace: default
  name: dynamic-context
current-context: dynamic-context
users:
- name: dynamic-user
  user:
    client-certificate-data: ${certB64}
    client-key-data: ${keyB64}`;

    // Fill Kubeconfig textarea
    await page.locator('textarea[placeholder*="apiVersion: v1"]').fill(kubeconfigStr);
    await page.waitForTimeout(500);

    // Save Cluster
    await page.click('button:has-text("Save Cluster")');

    // Assert cluster is registered in the list
    await expect(page.locator(`text=${kubeconfigClusterName}`).first()).toBeVisible({ timeout: 10000 });

    // Assert connection status transitions to "Connected"
    const kubeconfigRow = page.locator('.MuiPaper-root', { has: page.locator(`text=${kubeconfigClusterName}`) }).first();
    await expect(kubeconfigRow.locator('text=Connected').first()).toBeVisible({ timeout: 45000 });
    console.log('Method 3 (Kubeconfig Upload) validated successfully!');

    // ============================================================
    // PERSIST CONFIGURATION
    // ============================================================
    console.log('Saving all cluster configurations globally...');
    await page.waitForTimeout(1000); // Visual pause before final persist
    await page.click('button:has-text("Save Configuration")');

    // Wait for save toast/alert message
    await expect(page.locator('text=All configurations persisted successfully!')).toBeVisible({ timeout: 15000 });
    console.log('Global configuration successfully saved and persisted to backend settings database.');
  });
});
