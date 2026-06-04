import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  crossOrigin: 'anonymous',

  // Allow HMR WebSocket connections from:
  //   - Minikube pod network (10.5.0.x)
  //   - nginx Docker container via domain
  //   - local dev aliases
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '127.0.0.1:3000',
    'localhost:3000',
    '10.5.0.2',
    'kubi.kontactless.in',
    'backend.kubi.kontactless.in',
    'agent.kubi.kontactless.in',
  ],

  async rewrites() {
    // BACKEND_URL is set to http://backend.kubi.kontactless.in in local-dev mode
    // so proxy rewrites go through nginx → backend (with CORS already applied)
    const configuredBackend = process.env.BACKEND_URL;
    const localBackend =
      !configuredBackend ||
      configuredBackend.includes('localhost') ||
      configuredBackend.includes('127.0.0.1');
    const backendBase =
      process.env.NODE_ENV === 'production' && localBackend
        ? 'http://kubi-backend-service:8000'
        : configuredBackend ?? 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendBase}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${backendBase}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
