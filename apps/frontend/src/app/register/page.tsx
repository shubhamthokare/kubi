'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Box, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment, IconButton } from '@mui/material';
import { SreAuthCard } from '@/components/ui/sre-layout';

export default function RegisterPage() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    // Keep email for redirection before resetting state
    const targetEmail = email;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Registration failed. Email may already be in use.');
      }

      setSuccess('Account created successfully! Redirecting to verification page...');
      // Clear inputs
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      // Redirect to verification screen after 1.5 seconds
      setTimeout(() => {
        window.location.href = `/verify-email?email=${encodeURIComponent(targetEmail)}`;
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
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
            Create SRE Account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 1, leading: 1.6, fontSize: '0.85rem' }}>
            Register to provision your autonomous self-healing cluster diagnostics.
          </Typography>

          <Box component="form" onSubmit={handleRegister} sx={{ textAlign: 'left' }}>
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

            {success && (
              <Alert 
                severity="success" 
                sx={{ 
                  mb: 3, 
                  bgcolor: 'rgba(16, 185, 129, 0.08)', 
                  color: '#a7f3d0', 
                  border: '1px solid rgba(16, 185, 129, 0.18)',
                  borderRadius: 2.5,
                  fontSize: '0.8rem'
                }}
              >
                {success}
              </Alert>
            )}
            
            <Stack spacing={2.5}>
              <TextField
                className="sre-input-field"
                fullWidth
                label="Full Name"
                variant="outlined"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                        <User size={18} />
                      </InputAdornment>
                    ),
                  },
                }}
              />

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

              <TextField
                className="sre-input-field"
                fullWidth
                label="Confirm Password"
                variant="outlined"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                        <Lock size={18} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.35)', p: 1 }}>
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading || success !== ''}
                className="sre-btn-submit"
              >
                {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Sign Up'}
              </Button>
            </Stack>
          </Box>

          <Box sx={{ mt: 4.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 700, marginLeft: '4px' }}>
                Sign In
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
