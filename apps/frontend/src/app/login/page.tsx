'use client';

import React from 'react';
import { Activity, KeyRound } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, ThemeProvider, createTheme, CssBaseline, FormControlLabel, Switch } from '@mui/material';

// Custom high-fidelity brand SVGs as Lucide 1.x does not include brand logos anymore.
const GithubIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    height={size}
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const GitlabIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    height={size}
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="m23.505 13.093-1.86-5.731a.837.837 0 0 0-.294-.393.832.832 0 0 0-.486-.145.834.834 0 0 0-.482.164.845.845 0 0 0-.279.378l-2.079 6.4h-12.06l-2.079-6.4a.837.837 0 0 0-.279-.378.835.835 0 0 0-.482-.164.832.832 0 0 0-.486.145.837.837 0 0 0-.294.393l-1.86 5.731a.846.846 0 0 0 .052.716c.097.165.244.298.423.383l11.455 5.679a.834.834 0 0 0 .736 0l11.455-5.679a.846.846 0 0 0 .423-.383.846.846 0 0 0 .052-.716Z" />
  </svg>
);

export default function LoginPage() {
  const [forceAccountSelection, setForceAccountSelection] = React.useState(true);

  const handleLogin = (provider: string) => {
    // Redirect browser directly to backend auth login endpoint
    const query = forceAccountSelection ? '?prompt=select_account' : '';
    window.location.href = `/api/auth/login/${provider}${query}`;
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, px: 2 }}>
            AI-powered Kubernetes operations, diagnostic, and remediation platform.
          </Typography>

          <Box sx={{ mb: 3.5, display: 'flex', justifyContent: 'center' }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={forceAccountSelection} 
                  onChange={(e) => setForceAccountSelection(e.target.checked)} 
                  color="primary"
                  size="small"
                />
              }
              label={
                <Typography variant="body2" color="text.secondary" sx={{ userSelect: 'none' }}>
                  Force account selection
                </Typography>
              }
            />
          </Box>

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
              startIcon={<GithubIcon size={18} />}
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
              startIcon={<GitlabIcon size={18} />}
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
