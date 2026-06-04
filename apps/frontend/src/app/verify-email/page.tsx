'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, Mail, CheckCircle2 } from 'lucide-react';
import { Box, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment } from '@mui/material';
import { SreAuthCard } from '@/components/ui/sre-layout';
import { readApiResponse } from '@/lib/api';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  
  const [email, setEmail] = React.useState(emailParam);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendMessage, setResendMessage] = React.useState('');

  React.useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !code) {
      setError('Please fill in both email and verification code.');
      return;
    }
    if (code.length !== 6) {
      setError('Verification code must be exactly 6 digits.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(data.detail || 'Verification failed. Invalid or expired code.');
      }
      setSuccess('Email verified successfully! Logging you in...');
      localStorage.setItem('access_token', data.access_token);
      if (data.workspace_id) {
        localStorage.setItem('active_cluster_id', data.workspace_id);
      }
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please enter your email to resend the code.');
      return;
    }
    setError('');
    setResendMessage('');
    setResending(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await readApiResponse(res);
        throw new Error(data.detail || 'Failed to resend verification code.');
      }
      setResendMessage('Verification code resent successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
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
        Verify Your Email
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 2, leading: 1.6, fontSize: '0.85rem' }}>
        Enter the 6-digit OTP code sent to your registered SRE email address.
      </Typography>

      <Box component="form" onSubmit={handleVerify} sx={{ textAlign: 'left' }}>
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

        {resendMessage && (
          <Alert 
            severity="info" 
            sx={{ 
              mb: 3, 
              bgcolor: 'rgba(59, 130, 246, 0.08)', 
              color: '#93c5fd', 
              border: '1px solid rgba(59, 130, 246, 0.18)',
              borderRadius: 2.5,
              fontSize: '0.8rem'
            }}
          >
            {resendMessage}
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
            label="Verification Code (6-Digit OTP)"
            variant="outlined"
            required
            value={code}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, ''); // Numeric only
              if (val.length <= 6) setCode(val);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1 }}>
                    <CheckCircle2 size={18} />
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
            {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Verify Code'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
          <Link href="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
            Back to Sign In
          </Link>
        </Typography>

        <Button
          onClick={handleResend}
          disabled={resending || !email}
          sx={{
            textTransform: 'none',
            color: '#60a5fa',
            fontWeight: 700,
            fontSize: '0.85rem',
            padding: 0,
            minWidth: 0,
            '&:hover': { background: 'none', opacity: 0.8 }
          }}
        >
          {resending ? 'Resending...' : 'Resend Code'}
        </Button>
      </Box>

      <Box sx={{ mt: 3.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
          Secured by OTP and JWT Authentication.
        </Typography>
      </Box>
    </SreAuthCard>
  );
}

export default function VerifyEmailPage() {
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
        <Suspense fallback={
          <SreAuthCard className="sre-auth-card-upgraded">
            <CircularProgress color="inherit" />
            <Typography sx={{ mt: 2, color: 'white' }}>Loading verification portal...</Typography>
          </SreAuthCard>
        }>
          <VerifyEmailForm />
        </Suspense>
      </Container>
    </Box>
  );
}
