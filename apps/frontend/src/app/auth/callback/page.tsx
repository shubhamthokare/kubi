'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Box, Stack, Typography, Button, Container } from '@mui/material';
import { SreAuthCard } from '@/components/ui/sre-layout';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = React.useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  React.useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setStatus('error');
      setErrorMsg('Missing authorization parameters from provider.');
      return;
    }

    async function exchangeCode() {
      try {
        const response = await fetch(`/api/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Authorization code exchange failed.');
        }

        const data = await response.json();
        
        // Save SRE session variables
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('user_scopes', JSON.stringify(data.scopes || []));
        localStorage.setItem('auth_provider', data.provider);

        setStatus('success');
        
        // Brief delay for visual confirmation
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } catch (err: any) {
        console.error('Error during SSO callback:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to establish SRE session.');
      }
    }

    exchangeCode();
  }, [searchParams, router]);

  return (
    <SreAuthCard className="sre-auth-card-upgraded">
      {status === 'loading' && (
        <Stack spacing={3} alignItems="center">
          <Loader2 className="animate-spin" color="#60a5fa" size={48} />
          <Typography variant="h6" fontWeight="700" color="white">
            Establishing SRE Session
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
            Exchanging OAuth2 code & verifying cluster access scopes...
          </Typography>
        </Stack>
      )}

      {status === 'success' && (
        <Stack spacing={3} alignItems="center">
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'rgba(52, 211, 153, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #34d399',
            }}
          >
            <CheckCircle2 color="#34d399" size={32} />
          </Box>
          <Typography variant="h6" fontWeight="700" color="white">
            Access Granted
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
            Syncing telemetry dashboard. Redirecting shortly...
          </Typography>
        </Stack>
      )}

      {status === 'error' && (
        <Stack spacing={3} alignItems="center">
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'rgba(248, 113, 113, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #f87171',
            }}
          >
            <ShieldAlert color="#f87171" size={32} />
          </Box>
          <Typography variant="h6" fontWeight="700" color="white">
            Authentication Failed
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ px: 2, fontSize: '0.85rem' }}>
            {errorMsg}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => router.push('/login')}
            sx={{
              mt: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'white',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              px: 3,
              py: 1,
              '&:hover': {
                borderColor: '#60a5fa',
                bgcolor: 'rgba(96, 165, 250, 0.05)',
              },
            }}
          >
            Return to Login
          </Button>
        </Stack>
      )}
    </SreAuthCard>
  );
}

export default function CallbackPage() {
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

      <Container maxWidth="xs" sx={{ zIndex: 1, display: 'flex', justifyContent: 'center', py: 6 }}>
        <Suspense fallback={
          <SreAuthCard className="sre-auth-card-upgraded">
            <Stack spacing={3} alignItems="center">
              <Loader2 className="animate-spin" color="#60a5fa" size={48} />
              <Typography variant="h6" fontWeight="700" color="white">
                Loading Auth context...
              </Typography>
            </Stack>
          </SreAuthCard>
        }>
          <CallbackContent />
        </Suspense>
      </Container>
    </Box>
  );
}
