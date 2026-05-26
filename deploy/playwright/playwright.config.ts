import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env file manually without external dotenv dependency
let appURL = 'http://localhost:3000';
const envPath = path.resolve(__dirname, '.env');
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

const baseURL = process.env.APP_URL || appURL;

export default defineConfig({
  testDir: './tests',

  timeout: 300000,

  use: {
    headless: false,
    baseURL: baseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  }
});