'use client';

import React from 'react';
import { Activity, Github, Gitlab, KeyRound } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, ThemeProvider, createTheme, CssBaseline } from '@mui/material';

export default function LoginPage() {
  const handleLogin = (provider: string) => {
    // Redirect browser directly to backend auth login endpoint
    window.location.href = `/api/auth/login/${provider}`;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0f172a 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative Blur Spheres */}
      <Box
        sx={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(96, 165, 250, 0.1)',
          filter: 'blur(80px)',
          top: '20%',
          left: '10%',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(167, 139, 250, 0.1)',
          filter: 'blur(80px)',
          bottom: '20%',
          right: '10%',
        }}
      />

      <Container maxWidth="xs" sx={{ zIndex: 1 }}>
        <Card
          sx={{
            p: 4.5,
            bgcolor: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          {/* Logo */}
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 8px 16px -2px rgba(96, 165, 250, 0.3)',
            }}
          >
            <Activity color="white" size={32} />
          </Box>

          <Typography variant="h4" fontWeight="800" color="white" gutterBottom sx={{ letterSpacing: '-1px' }}>
            Kubi AI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 2 }}>
            AI-powered Kubernetes operations, diagnostic, and remediation platform.
          </Typography>

          <Stack spacing={2} sx={{ width: '100%' }}>
            {/* Google Workspace */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<KeyRound size={18} />}
              onClick={() => handleLogin('google')}
              sx={{
                py: 1.5,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                bgcolor: 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#60a5fa',
                  bgcolor: 'rgba(96, 165, 250, 0.05)',
                  boxShadow: '0 0 15px -3px rgba(96, 165, 250, 0.2)',
                },
              }}
            >
              Sign in with Google Workspace
            </Button>

            {/* GitHub */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Github size={18} />}
              onClick={() => handleLogin('github')}
              sx={{
                py: 1.5,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                bgcolor: 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#a78bfa',
                  bgcolor: 'rgba(167, 139, 250, 0.05)',
                  boxShadow: '0 0 15px -3px rgba(167, 139, 250, 0.2)',
                },
              }}
            >
              Sign in with GitHub Enterprise
            </Button>

            {/* GitLab */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Gitlab size={18} />}
              onClick={() => handleLogin('gitlab')}
              sx={{
                py: 1.5,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                bgcolor: 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#34d399',
                  bgcolor: 'rgba(52, 211, 153, 0.05)',
                  boxShadow: '0 0 15px -3px rgba(52, 211, 153, 0.2)',
                },
              }}
            >
              Sign in with GitLab SRE
            </Button>
          </Stack>

          <Box sx={{ mt: 5 }}>
            <Typography variant="caption" color="text.secondary">
              Secured by OIDC / OAuth2 Authentication.
            </Typography>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
