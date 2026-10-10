import React from 'react';

export interface StatusDotProps {
  status: 'active' | 'idle' | 'error' | 'connecting';
  size?: number;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, size = 8 }) => {
  let color = 'var(--gc-text-muted)';
  let glow = 'none';
  let className = '';

  switch (status) {
    case 'active':
      color = 'var(--gc-success)';
      glow = '0 0 6px rgba(48, 209, 88, 0.45)';
      break;
    case 'idle':
      color = 'var(--gc-warning)';
      glow = '0 0 6px rgba(255, 214, 10, 0.35)';
      break;
    case 'error':
      color = 'var(--gc-danger)';
      glow = '0 0 6px rgba(255, 69, 58, 0.35)';
      break;
    case 'connecting':
      color = 'var(--gc-accent)';
      glow = '0 0 8px rgba(10, 132, 255, 0.5)';
      className = 'breathe-pulse';
      break;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: glow,
        transition: 'all 0.2s ease',
      }}
    />
  );
};
