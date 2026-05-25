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
      main: '#34d399',
    },
    warning: {
      main: '#fbbf24',
    },
    error: {
      main: '#f87171',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth/callback');
  const [mounted, setMounted] = React.useState(false);
  const [authorized, setAuthorized] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token) {
      setAuthorized(true);
    } else if (!isAuthPage) {
      setAuthorized(false);
      router.push('/login');
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
