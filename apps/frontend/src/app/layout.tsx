'use client';

import React from 'react';
import "./globals.css";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#60a5fa',
    },
    secondary: {
      main: '#a78bfa',
    },
    success: {
      main: '#10b981',
    },
    warning: {
      main: '#f59e0b',
    },
    error: {
      main: '#ef4444',
    },
    background: {
      default: '#030712',
      paper: 'rgba(15, 23, 42, 0.45)',
    },
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  shape: {
    borderRadius: 16,
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname ? (pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/verify-email' || pathname === '/forgot-password' || pathname.startsWith('/auth/callback')) : true;
  const [mounted, setMounted] = React.useState(false);
  const [authorized, setAuthorized] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (!pathname) return; // Prevent redirect check until pathname is fully resolved on the client

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    let isExpired = false;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && Date.now() >= payload.exp * 1000) {
          isExpired = true;
        }
      } catch (e) {
        isExpired = true;
      }
    }

    if (token && !isExpired) {
      setAuthorized(true);
    } else {
      setAuthorized(false);
      if (token) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('username');
        localStorage.removeItem('active_cluster_id');
        localStorage.removeItem('active_workspace_id');
        localStorage.removeItem('user_scopes');
        localStorage.removeItem('auth_provider');
      }
      if (!isAuthPage) {
        router.push('/login');
      }
    }
  }, [pathname, router, isAuthPage]);

  // Block visual rendering during SSR/initial mount to prevent unauthenticated content leak
  if (!mounted) {
    return <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a' }} />;
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (!authorized) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar />
      <Box sx={{ maxWidth: 'xl', mx: 'auto', px: 3, py: 4 }}>
        {/* Page Content */}
        {children}
      </Box>
    </Box>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <title>Kubi AI Dashboard</title>
        <meta name="description" content="Autonomous Kubernetes Incident Recovery Agent" />
      </head>
      <body>
        <div className="cosmic-bg" />
        <ThemeProvider theme={darkTheme}>
          <CssBaseline />
          <Layout>
            {children}
          </Layout>
        </ThemeProvider>
      </body>
    </html>
  );
}
