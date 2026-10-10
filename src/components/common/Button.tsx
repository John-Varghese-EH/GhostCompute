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
  const sizeStyle: React.CSSProperties = size === 'sm' ? { padding: '5px 10px', fontSize: '12px' } : {};

  return (
    <button
      className={baseClass}
      disabled={disabled || loading}
      {...props}
      style={{ ...sizeStyle, ...props.style }}
    >
      {loading ? (
        <span className="spinner" />
      ) : null}
      {children}
    </button>
  );
};
