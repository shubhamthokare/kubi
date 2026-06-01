'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Mail, Lock, KeyRound, ArrowLeft } from 'lucide-react';
import { Box, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment } from '@mui/material';
import { SreAuthCard } from '@/components/ui/sre-layout';

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
            Reset Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 2, leading: 1.6, fontSize: '0.85rem' }}>
            {stage === 'email' 
              ? 'Enter your registered email address to request a secure 6-digit OTP verification code.' 
              : 'Enter the verification code sent to your email and your new secure SRE password.'}
          </Typography>

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

          {stage === 'email' ? (
            <Box component="form" onSubmit={handleRequestOtp} sx={{ textAlign: 'left' }}>
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

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  className="sre-btn-submit"
                >
                  {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Send Reset Code'}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleResetPassword} sx={{ textAlign: 'left' }}>
              <Stack spacing={2.5}>
                <TextField
                  className="sre-input-field"
                  fullWidth
                  label="Verification Code (6-Digit OTP)"
                  variant="outlined"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                          <KeyRound size={18} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <TextField
                  className="sre-input-field"
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
                        <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                          <Lock size={18} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  className="sre-btn-submit"
                >
                  {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Reset Password'}
                </Button>
              </Stack>
            </Box>
          )}

          <Box sx={{ mt: 4.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/login" style={{ color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </Box>
        </SreAuthCard>
      </Container>
    </Box>
  );
}
