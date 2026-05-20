'use client';

import React, { useEffect } from 'react';
import { Box, Paper, Typography, Button, Container, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { AlertTriangle, RefreshCw, Home, ChevronDown } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console or error tracking service
    console.error('NextJS Dashboard Exception:', error);
  }, [error]);

  return (
    <Container maxWidth="md" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '75vh', py: 4 }}>
      <Paper
        elevation={0}
        sx={{
          p: 5,
          textAlign: 'center',
          borderRadius: 4,
          background: 'rgba(30, 41, 59, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(248, 113, 113, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            color: '#f87171',
            mb: 3,
            animation: 'pulse 2s infinite ease-in-out',
            '@keyframes pulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 1 },
              '50%': { transform: 'scale(1.05)', opacity: 0.8 },
            }
          }}
        >
          <AlertTriangle size={36} />
        </Box>

        <Typography variant="h4" fontWeight="800" sx={{ mb: 2, background: 'linear-gradient(135deg, #f87171 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Dashboard Pipeline Interrupted
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: '500px', mx: 'auto', lineHeight: 1.6 }}>
          An unexpected error occurred while rendering the dashboard. Don't worry, the autonomous Kubi AI SRE daemon continues to run safely in your cluster.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', width: '100%', mb: 4 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<RefreshCw size={18} />}
            onClick={() => reset()}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 3,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: '0 4px 14px 0 rgba(96, 165, 250, 0.4)',
              '&:hover': {
                boxShadow: '0 6px 20px 0 rgba(96, 165, 250, 0.6)',
              }
            }}
          >
            Attempt Auto-Recovery
          </Button>

          <Button
            variant="outlined"
            startIcon={<Home size={18} />}
            onClick={() => window.location.href = '/'}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 3,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: 'text.primary',
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.05)',
              }
            }}
          >
            Reset Dashboard View
          </Button>
        </Box>

        <Accordion
          sx={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px !important',
            overflow: 'hidden',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary
            expandIcon={<ChevronDown size={18} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />}
            sx={{ px: 3, '&:hover': { background: 'rgba(255, 255, 255, 0.02)' } }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight="600">
              Developer Diagnostics (Error Logs)
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 3, pb: 3, pt: 0, textAlign: 'left' }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#f87171',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '200px',
              }}
            >
              {error.stack || error.message || 'No stack trace available.'}
              {error.digest && (
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)', color: 'text.secondary', fontSize: '0.75rem' }}>
                  Digest Signature: {error.digest}
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Container>
  );
}
