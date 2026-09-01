import React, { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: string;
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
      <div style={{ fontSize: '32px', marginBottom: 'var(--gc-space-sm)' }}>{icon}</div>
      <h3 style={{ fontSize: '16px', fontWeight: 500 }}>{title}</h3>
      <p className="text-muted" style={{ fontSize: '14px', maxWidth: '300px' }}>
        {description}
      </p>
      {action && <div style={{ marginTop: 'var(--gc-space-md)' }}>{action}</div>}
    </div>
  );
};
