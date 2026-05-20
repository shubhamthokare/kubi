# 🎨 Kubi Frontend Dashboard

Next.js-based premium dashboard for Kubi AI, providing real-time incident monitoring, remediation review, and SRE analytics interface.

---

## 📋 Overview

The Kubi Frontend is a modern, responsive dashboard that enables SREs and operators to:
- Monitor Kubernetes cluster health in real-time
- Review AI-generated root cause analysis (RCA) reports
- Approve and execute automated remediation plans
- Track incident history and postmortems
- Analyze trends and generate compliance reports
- Manage platform settings and integrations

---

## 🔧 Tech Stack

- **Framework**: Next.js 15+
- **UI Libraries**: MUI (Material-UI), Shadcn UI, Tailwind CSS 4
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Emotion
- **State Management**: React Hooks / Context API
- **HTTP Client**: Axios / Fetch API

---

## 📦 Installation

### Prerequisites
- Node.js 18+
- npm, yarn, or pnpm
- Git

### Setup Steps

```bash
# 1. Navigate to frontend directory
cd apps/frontend

# 2. Install dependencies
npm install

# 3. Create .env.local file
cp .env.example .env.local

# 4. Configure environment variables
# Edit .env.local and set NEXT_PUBLIC_API_URL
```

---

## 🚀 Running the Frontend

### Development Mode
```bash
npm run dev
```
Opens at **http://localhost:3000** with hot reload.

### Production Build
```bash
npm run build
npm start
```

### Build Statistics
```bash
npm run build -- --analyze
```

---

## 📁 Project Structure

```
apps/frontend/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   └── [routes]/        # Dynamic routes
│   ├── components/          # Reusable UI components
│   │   ├── dashboard/       # Dashboard components
│   │   ├── common/          # Common components (Header, Footer, etc.)
│   │   └── ui/              # Shadcn UI component wrappers
│   ├── lib/                 # Utility functions
│   │   ├── api.ts           # API client setup
│   │   ├── utils.ts         # Helper functions
│   │   └── hooks.ts         # Custom React hooks
│   ├── styles/              # Global styles
│   │   └── globals.css      # Tailwind CSS
│   └── types/               # TypeScript type definitions
├── public/                  # Static assets
├── .env.example            # Environment template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── tailwind.config.ts      # Tailwind CSS config
├── next.config.js          # Next.js config
└── LICENSE                 # MIT License
```

---

## 🔌 Environment Variables

Create `.env.local` with the following:

```env
# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Frontend Public URL (for CORS and redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Agent Service URL (informational)
NEXT_PUBLIC_AGENT_URL=http://localhost:8080

# Optional: For production deployments
# NEXT_PUBLIC_API_URL=https://api.kubi.ai/api
# NEXT_PUBLIC_APP_URL=https://kubi.ai
```

⚠️ **Security**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never put secrets here. Use server-side environment variables for secrets.

---

## 🎨 Styling

### Tailwind CSS
All styling uses **Tailwind CSS 4** with custom theme configuration:
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Click me
</button>
```

### Material-UI (MUI)
For complex components:
```tsx
import { Button, TextField, Card } from '@mui/material';

<Button variant="contained" color="primary">
  Submit
</Button>
```

### Shadcn UI
Pre-built accessible components:
```tsx
import { Button } from '@/components/ui/button';

<Button>Click me</Button>
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Run in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

---

## 🧹 Code Quality

```bash
# Lint code (ESLint)
npm run lint

# Format code (Prettier)
npm run format

# Check formatting without fixing
npm run format:check

# Type checking
npm run type-check

# All checks combined
npm run lint && npm run format && npm run type-check
```

---

## 🐳 Docker

### Build Image
```bash
docker build -t kubi-frontend:latest .
```

### Optimize Build (Multi-stage)
```bash
docker build --target production -t kubi-frontend:latest .
```

### Run Container
```bash
docker run -d \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000/api \
  --name kubi-frontend \
  kubi-frontend:latest
```

### View Logs
```bash
docker logs -f kubi-frontend
```

---

## 📚 Key Features

### Dashboard
- **Real-time Status**: Live pod and deployment monitoring
- **Incident Feed**: Chronological list of detected issues
- **RCA Reports**: AI-generated root cause analysis with visualizations
- **Remediation Queue**: Pending and approved remediation plans

### Analytics
- **Trend Analysis**: Historical incident patterns
- **MTTR Tracking**: Mean time to resolution metrics
- **Failure Categories**: Breakdown of failure types
- **Team Performance**: SRE efficiency metrics

### Integration Points
- **GitLab**: Pipeline status and rollback triggers
- **Elasticsearch**: Advanced search and log analysis
- **Arize**: LLM observability and tracing
- **Slack** (optional): Alert notifications

---

## 🔗 API Integration

The frontend communicates with the backend API:

```tsx
// Example: Fetch incidents
const response = await fetch(
  `${process.env.NEXT_PUBLIC_API_URL}/incidents`
);
const incidents = await response.json();
```

All API calls are proxied through the backend for security.

---

## 🎯 Performance Optimization

### Code Splitting
```tsx
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./Heavy'), {
  loading: () => <div>Loading...</div>,
});
```

### Image Optimization
```tsx
import Image from 'next/image';

<Image 
  src="/image.jpg" 
  alt="Description" 
  width={400} 
  height={300} 
/>
```

### Route Prefetching
```tsx
import Link from 'next/link';

<Link href="/dashboard" prefetch={true}>
  Dashboard
</Link>
```

---

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
# Find and kill process
lsof -i :3000 | grep LISTEN
kill -9 <PID>

# Or use different port
npm run dev -- -p 3001
```

### API Connection Error
```bash
# Verify backend is running
curl http://localhost:8000/health

# Check NEXT_PUBLIC_API_URL in .env.local
cat .env.local | grep NEXT_PUBLIC_API_URL
```

### Build Errors
```bash
# Clear build cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Styling Issues
```bash
# Rebuild Tailwind CSS
npm run build

# Verify tailwind.config.ts is correct
cat tailwind.config.ts
```

---

## 📖 For More Information

- **Local Setup Guide**: See [LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md)
- **Deployment Guide**: See [DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
- **Commands Reference**: See [COMMANDS.md](../../docs/COMMANDS.md)
- **Main README**: See [README.md](../../README.md)

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](./LICENSE) for details.

---

*Last Updated: May 20, 2026*
*Kubi Frontend Documentation*
