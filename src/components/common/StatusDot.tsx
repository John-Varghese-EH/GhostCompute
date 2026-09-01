import React from 'react';

export interface StatusDotProps {
  status: 'active' | 'idle' | 'error' | 'connecting';
  size?: number;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, size = 8 }) => {
  let color = 'var(--gc-text-muted)';
  let animation = 'none';

  switch (status) {
    case 'active':
      color = 'var(--gc-success)';
      break;
    case 'idle':
      color = 'var(--gc-warning)';
      break;
    case 'error':
      color = 'var(--gc-danger)';
      break;
    case 'connecting':
      color = 'var(--gc-accent)';
      animation = 'pulse 1.5s infinite';
      break;
  }

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        animation,
      }}
    >
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
};
