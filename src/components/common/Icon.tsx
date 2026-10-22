import React from 'react';

export interface IconProps {
  name: string;
  size?: number | string;
  className?: string;
  filled?: boolean;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  className = '',
  filled = false,
  style,
}) => {
  const sizeStyle = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      className={`material-symbols-outlined ${filled ? 'fill' : ''} ${className}`}
      style={{
        fontSize: sizeStyle,
        width: sizeStyle,
        height: sizeStyle,
        lineHeight: sizeStyle,
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
};
