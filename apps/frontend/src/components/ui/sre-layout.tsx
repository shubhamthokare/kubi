import React from 'react';
import { Card, CardProps, Box, BoxProps } from '@mui/material';

export const SreCard = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, sx, ...props }, ref) => (
    <Card
      ref={ref}
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderRadius: 3,
        border: '1px solid rgba(255, 255, 255, 0.05)',
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
        borderRadius: 2.5,
        border: '1px solid rgba(255, 255, 255, 0.08)',
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
        bgcolor: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        borderRadius: 4,
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
