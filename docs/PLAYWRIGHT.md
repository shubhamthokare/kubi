# 🎭 Playwright End-to-End Testing Guide

This guide details the setup, configuration, and execution of **Playwright end-to-end (E2E) integration tests** in the Kubi AI platform. 

Tests are designed to validate the entire operational lifecycle, including incident ingestion, Google Gemini LLM reasoning, operators approval gates, and automated Kubernetes remediation.

---

## 🏗️ Architecture & Directory Structure

All E2E testing resources reside inside the `deploy/playwright/` folder:

```
deploy/playwright/
├── tests/                     # Test specification suites
│   ├── connectivity.spec.ts   # UI connectivity & environment check tests
│   └── incident.spec.ts       # Full incident lifecycle integration tests
├── test-results/              # Local storage for execution logs, screenshots & videos
├── playwright.config.ts       # Playwright configuration, timeouts & browsers
├── package.json               # Node dependencies & execution scripts
└── .env                       # Local execution environment overrides
```

---

## 📋 Prerequisites & Quick Setup

Ensure **Node.js 18+** is installed on your local development machine.

### 1. Install Node Dependencies
Navigate to the Playwright directory and install the necessary packages:
```bash
cd deploy/playwright
npm install
```

### 2. Install Playwright Browsers & System Drivers
Playwright runs tests in isolated browser binaries. Install these along with any OS-level dependencies:
```bash
npx playwright install --with-deps
```

> [!NOTE]
> On Windows, running `npx playwright install --with-deps` will automatically configure the correct browser binaries (Chromium, Firefox, WebKit) in your local cache directory.

---

## ⚙️ Environment Configuration

Tests interact with the live running Frontend and Backend microservices. Create a `.env` file in `deploy/playwright/` to define target endpoints:

```env
# Target Frontend Dashboard URL
BASE_URL=http://localhost:3000

# Target Backend API Service URL
API_URL=http://localhost:8000
```

---

## 🚀 Execution Commands Reference

Use the following `npm` and `npx` scripts to execute test suites in different modes:

| Command | Execution Mode | Best Use Case |
|---------|----------------|---------------|
| `npm test` | **Headless (CLI)** | Standard run for local validation or CI/CD pipelines |
| `npm run test:ui` | **Interactive UI Dashboard** | Interactive debugging, tracing, and step-by-step visual inspection |
| `npm run test:headed` | **Headed (Visible Browser)** | Watching tests run inside a standard visible browser window |
| `npx playwright test tests/incident.spec.ts` | **Targeted Run** | Running a specific test file |
| `npx playwright test --debug` | **Step-by-step Debugger** | Launches the Playwright Inspector to step through lines of test code |

---

## 🛠️ Interactive Debugging with Playwright UI

The Playwright UI dashboard is an incredibly powerful tool for inspecting and debugging complex microservice interactions.

To start the UI dashboard:
```bash
npm run test:ui
```

### Key UI Features:
* **Timeline Tracing**: Hover over actions in the sidebar to view the exact screen state of your Next.js dashboard at that microsecond.
* **Console Logs & Network Inspection**: Inspect every backend REST API call, body payload, and response header triggered during the operator approval gate or remediation phase.
* **Auto-generated Locators**: Use the click-to-locate tool to capture highly specific MUI button and field selectors directly from the page DOM.

---

## 🚨 Troubleshooting Common Errors

### 1. Browser Executables Missing
If you see the error:
`Error: Playwright connection refused or browser executables not found`
**Fix**: Re-run the browser installation script:
```bash
npx playwright install
```

### 2. Connection Refused (Ports 3000 / 8000)
If the tests fail immediately with a network connection error:
**Fix**: Ensure your local development services or Minikube deployments are actively running:
* Frontend should be serving at `http://localhost:3000` (or your Minikube ingress).
* Backend should be serving at `http://localhost:8000`.
* Verify connectivity using:
  ```bash
  curl http://localhost:8000/health
  ```

### 3. CI/CD Pipeline Failures (CORS / Headers)
If tests fail inside headless runners due to authorization or origin blocks:
**Fix**: Double check that `deploy/playwright/.env` is not committed and that GitLab CI runner variables correctly expose `BASE_URL` and `API_URL`.

---

*Last Updated: May 20, 2026*  
*Kubi AI Playwright Integration Suite*
