import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  timeout: 300000,

  use: {
    headless: false,
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  }
});