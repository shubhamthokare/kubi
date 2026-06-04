'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Box, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment, IconButton } from '@mui/material';
import { SreAuthCard } from '@/components/ui/sre-layout';
import { readApiResponse } from '@/lib/api';

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
      
      const data = await readApiResponse(res);
      
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
        bgcolor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Pinned background grid and glows */}
      <div className="cosmic-bg" />
      
      {/* Custom absolute blurs */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-blue-500/5 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-violet-600/5 rounded-full blur-[100px]" />

      <Container maxWidth="xs" sx={{ zIndex: 1, py: 6 }}>
        <SreAuthCard className="sre-auth-card-upgraded">
          {/* Logo with double pulsing glow ring */}
          <Box sx={{ position: 'relative', width: 72, height: 72, mx: 'auto', mb: 3.5 }}>
            <Box
              sx={{
                position: 'absolute',
                inset: -6,
                borderRadius: '38%',
                background: 'radial-gradient(circle, rgba(96,165,250,0.2) 0%, transparent 70%)',
                animation: 'ring-pulse-1 3s infinite ease-in-out',
              }}
            />
            <Box
              sx={{
                width: '100%',
                height: '100%',
                borderRadius: 4.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                boxShadow: '0 0 25px rgba(96, 165, 250, 0.45), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Activity color="white" size={36} className="animate-pulse" />
            </Box>
          </Box>

          <Typography 
            variant="h4" 
            fontWeight="900" 
            color="white" 
            gutterBottom 
            sx={{ 
              letterSpacing: '-1.5px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              background: 'linear-gradient(135deg, #ffffff 30%, #a5f3fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1
            }}
          >
            Kubi AI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 1, leading: 1.6, fontSize: '0.85rem' }}>
            AI-powered Kubernetes operations, diagnostic, and remediation platform.
          </Typography>

          {/* Credentials Login Form */}
          <Box component="form" onSubmit={handleCredentialLogin} sx={{ mt: 3, textAlign: 'left' }}>
            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3, 
                  bgcolor: 'rgba(239, 68, 68, 0.08)', 
                  color: '#fca5a5', 
                  border: '1px solid rgba(239, 68, 68, 0.18)',
                  borderRadius: 2.5,
                  fontSize: '0.8rem'
                }}
              >
                {error}
              </Alert>
            )}
            
            <Stack spacing={2.5}>
              <TextField
                className="sre-input-field"
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
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                        <Mail size={18} />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                className="sre-input-field"
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
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                        <Lock size={18} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.35)', p: 1 }}>
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Box sx={{ display: 'flex', justifySelf: 'end', mt: -0.5 }}>
                <Link href="/forgot-password" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                  Forgot Password?
                </Link>
              </Box>

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                className="sre-btn-submit"
              >
                {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Sign In'}
              </Button>
            </Stack>
          </Box>

          <Box sx={{ mt: 4.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              Don't have an SRE account?{' '}
              <Link href="/register" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 700, marginLeft: '4px' }}>
                Sign Up
              </Link>
            </Typography>
          </Box>

          <Box sx={{ mt: 3.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
              Secured by OTP and JWT Authentication.
            </Typography>
          </Box>
        </SreAuthCard>
      </Container>
    </Box>
  );
}
