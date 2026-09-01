import React, { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  children,
  className = '',
  ...props
}) => {
  const baseClass = `btn btn-${variant} ${className}`;
  const style = size === 'sm' ? { padding: '4px 8px', fontSize: '12px' } : {};

  return (
    <button
      className={baseClass}
      disabled={disabled || loading}
      style={style}
      {...props}
    >
      {loading ? (
        <span className="spinner">...</span>
      ) : null}
      {children}
    </button>
  );
};
