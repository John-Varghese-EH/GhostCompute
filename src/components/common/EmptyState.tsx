import React, { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div
      className="flex flex-col items-center gap-sm text-center"
      style={{
        padding: 'var(--gc-space-xl) var(--gc-space-md)',
      }}
    >
      <div 
        className="flex items-center justify-center text-muted"
        style={{ 
          width: '52px',
          height: '52px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--gc-border)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          marginBottom: 'var(--gc-space-sm)',
          fontSize: '22px'
        }}
      >
        {icon}
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.2px' }}>{title}</h3>
      <p className="text-muted" style={{ fontSize: '13px', maxWidth: '320px', lineHeight: 1.5 }}>
        {description}
      </p>
      {action && <div style={{ marginTop: 'var(--gc-space-md)' }}>{action}</div>}
    </div>
  );
};
