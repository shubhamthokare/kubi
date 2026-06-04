import React from 'react';
import { Card, CardProps, Box, BoxProps } from '@mui/material';

export const SreCard = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, sx, ...props }, ref) => (
    <Card
      ref={ref}
      elevation={0}
      sx={{
        bgcolor: 'rgba(15, 23, 42, 0.68)',
        borderRadius: 1,
        border: '1px solid rgba(148, 163, 184, 0.12)',
        boxShadow: 'none',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Card>
  )
);
SreCard.displayName = 'SreCard';

export const SreConsole = React.forwardRef<HTMLDivElement, BoxProps>(
  ({ children, sx, ...props }, ref) => (
    <Box
      ref={ref}
      sx={{
        bgcolor: '#020617',
        borderRadius: 1,
        border: '1px solid rgba(148, 163, 184, 0.14)',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        color: '#e2e8f0',
        p: 2.5,
        overflowY: 'auto',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  )
);
SreConsole.displayName = 'SreConsole';

export const SreAuthCard = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, sx, ...props }, ref) => (
    <Card
      ref={ref}
      elevation={0}
      sx={{
        p: 4.5,
        bgcolor: 'rgba(15, 23, 42, 0.76)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        boxShadow: '0 20px 44px -24px rgba(0,0,0,0.7)',
        borderRadius: 1,
        textAlign: 'center',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Card>
  )
);
SreAuthCard.displayName = 'SreAuthCard';
