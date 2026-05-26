'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, Mail, CheckCircle2 } from 'lucide-react';
import { Box, Card, Stack, Typography, Button, Container, TextField, Alert, CircularProgress, InputAdornment } from '@mui/material';

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
      const data = await res.json();
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
        const data = await res.json();
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
        Verify Your Email
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, px: 2 }}>
        Enter the 6-digit OTP code sent to your registered SRE email address.
      </Typography>

      <Box component="form" onSubmit={handleVerify} sx={{ textAlign: 'left' }}>
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

        {resendMessage && (
          <Alert severity="info" sx={{ mb: 2.5, bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            {resendMessage}
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
                  <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)', mr: 1 }}>
                    <CheckCircle2 size={18} />
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
            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Verify Code'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <Link href="/login" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            Back to Sign In
          </Link>
        </Typography>

        <Button
          onClick={handleResend}
          disabled={resending || !email}
          sx={{
            textTransform: 'none',
            color: '#60a5fa',
            fontWeight: 600,
            '&:hover': { background: 'none', opacity: 0.8 }
          }}
        >
          {resending ? 'Resending...' : 'Resend Code'}
        </Button>
      </Box>

      <Box sx={{ mt: 3.5 }}>
        <Typography variant="caption" color="text.secondary">
          Secured by OTP and JWT Authentication.
        </Typography>
      </Box>
    </Card>
  );
}

export default function VerifyEmailPage() {
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
        <Suspense fallback={
          <Card sx={{ p: 4.5, bgcolor: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(20px)', borderRadius: 4, textAlign: 'center', color: 'white' }}>
            <CircularProgress color="inherit" />
            <Typography sx={{ mt: 2 }}>Loading verification portal...</Typography>
          </Card>
        }>
          <VerifyEmailForm />
        </Suspense>
      </Container>
    </Box>
  );
}
