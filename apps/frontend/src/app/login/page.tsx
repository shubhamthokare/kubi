'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment, IconButton } from '@mui/material';

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        // If account is unverified, backend returns 403 with 'email_not_verified' detail
        if (res.status === 403 && data.detail === 'email_not_verified') {
          window.location.href = `/verify-email?email=${encodeURIComponent(email)}`;
          return;
        }
        throw new Error(data.detail || 'Invalid email or password.');
      }
      
      localStorage.setItem('access_token', data.access_token);
      if (data.workspace_id) {
        localStorage.setItem('active_cluster_id', data.workspace_id);
      }
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
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

          {/* Credentials Login Form */}
          <Box component="form" onSubmit={handleCredentialLogin} sx={{ mt: 3, textAlign: 'left' }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {error}
              </Alert>
            )}
            
            <Stack spacing={2.5}>
              <TextField
                fullWidth
                label="Email Address"
                variant="outlined"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                        <Mail size={18} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: 'rgba(15, 23, 42, 0.3)',
                    borderRadius: 2.5,
                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                    '&.Mui-focused fieldset': { borderColor: '#60a5fa' },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'rgba(255, 255, 255, 0.4)',
                    '&.Mui-focused': { color: '#60a5fa' },
                  },
                }}
              />

              <TextField
                fullWidth
                label="Password"
                variant="outlined"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                        <Lock size={18} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: 'rgba(15, 23, 42, 0.3)',
                    borderRadius: 2.5,
                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                    '&.Mui-focused fieldset': { borderColor: '#60a5fa' },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'rgba(255, 255, 255, 0.4)',
                    '&.Mui-focused': { color: '#60a5fa' },
                  },
                }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1.5 }}>
                <Link href="/forgot-password" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
                  Forgot Password?
                </Link>
              </Box>

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
                  boxShadow: '0 8px 16px -2px rgba(96, 165, 250, 0.3)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    boxShadow: '0 12px 20px -2px rgba(96, 165, 250, 0.4)',
                    opacity: 0.9,
                  },
                }}
              >
                {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Sign In'}
              </Button>
            </Stack>
          </Box>

          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Don't have an SRE account?{' '}
              <Link href="/register" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
                Sign Up
              </Link>
            </Typography>
          </Box>

          <Box sx={{ mt: 3.5 }}>
            <Typography variant="caption" color="text.secondary">
              Secured by OTP and JWT Authentication.
            </Typography>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
