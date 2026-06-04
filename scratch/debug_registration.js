const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('request', req => console.log('>> REQUEST:', req.method(), req.url()));
  page.on('response', res => console.log('<< RESPONSE:', res.status(), res.url()));

  console.log('Navigating to register page...');
  await page.goto('http://localhost:3000/register');

  console.log('Filling form...');
  await page.locator('input').nth(0).fill('Debug User');
  await page.locator('input[type="email"]').fill(`debug_node_${Date.now()}@example.com`);
  await page.locator('input[type="password"]').first().fill('12345679@mE');
  await page.locator('input[type="password"]').nth(1).fill('12345679@mE');

  console.log('Submitting...');
  await page.locator('button[type="submit"]').click();

  console.log('Waiting 5 seconds...');
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log('Final URL:', url);

  const alertVisible = await page.locator('.MuiAlert-message').isVisible();
  if (alertVisible) {
    const alertText = await page.locator('.MuiAlert-message').innerText();
    console.log('ALERT TEXT:', alertText);
  }

  await browser.close();
}

run().catch(console.error);
