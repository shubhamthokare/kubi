'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, KeyRound, ArrowLeft } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment } from '@mui/material';

export default function ForgotPasswordPage() {
  const [stage, setStage] = React.useState<'email' | 'reset'>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to request reset OTP.');
      }
      setSuccess('Verification OTP code has been generated and sent to your email.');
      setStage('reset');
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !newPassword) {
      setError('Please fill in both the verification code and your new password.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reset password.');
      }
      setSuccess('Your password has been successfully reset! Redirecting to login...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
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
            Reset Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 2 }}>
            {stage === 'email' 
              ? 'Enter your registered email address to request a secure 6-digit OTP verification code.' 
              : 'Enter the verification code sent to your email and your new secure SRE password.'}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left', bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3, textAlign: 'left', bgcolor: 'rgba(34, 197, 94, 0.1)', color: '#86efac', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              {success}
            </Alert>
          )}

          {stage === 'email' ? (
            <Box component="form" onSubmit={handleRequestOtp} sx={{ textAlign: 'left' }}>
              <Stack spacing={3}>
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
                  {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Send Reset Code'}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleResetPassword} sx={{ textAlign: 'left' }}>
              <Stack spacing={3}>
                <TextField
                  fullWidth
                  label="Verification Code (6-Digit OTP)"
                  variant="outlined"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                          <KeyRound size={18} />
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
                  label="New Password"
                  variant="outlined"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                          <Lock size={18} />
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
                  {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Reset Password'}
                </Button>
              </Stack>
            </Box>
          )}

          <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/login" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
