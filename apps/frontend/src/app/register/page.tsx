'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment, IconButton } from '@mui/material';

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
          top: '15%',
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
          bottom: '15%',
          right: '10%',
        }}
      />

      <Container maxWidth="xs" sx={{ zIndex: 1, py: 4 }}>
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
            Create SRE Account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, px: 2 }}>
            Register to provision your automated Kubernetes diagnostic environment.
          </Typography>

          <Box component="form" onSubmit={handleRegister} sx={{ textAlign: 'left' }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2.5, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mb: 2.5, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                {success}
              </Alert>
            )}
            
            <Stack spacing={2.5}>
              <TextField
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
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                        <User size={18} />
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

              <TextField
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
                      <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                        <Lock size={18} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading || success !== ''}
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
                {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Sign Up'}
              </Button>
            </Stack>
          </Box>

          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
                Sign In
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
