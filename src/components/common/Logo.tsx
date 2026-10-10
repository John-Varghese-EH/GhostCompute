import React from 'react';

export interface LogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Logo: React.FC<LogoProps> = ({ size = 24, className = '', style }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={`gc-logo-glyph ${className}`}
    style={{ ...style, overflow: 'visible' }}
  >
    {/* Architectural Ghost Compute Envelope */}
    <path 
      d="M12 2.5C7.3 2.5 4.5 6.2 4.5 11.2V19.2C4.5 20.1 5.6 20.6 6.2 19.9L8.1 18.1C8.6 17.6 9.4 17.6 9.9 18.1L11.3 19.5C11.7 19.9 12.3 19.9 12.7 19.5L14.1 18.1C14.6 17.6 15.4 17.6 15.9 18.1L17.8 19.9C18.4 20.6 19.5 20.1 19.5 19.2V11.2C19.5 6.2 16.7 2.5 12 2.5Z" 
      fill="currentColor" 
      fillOpacity="0.08" 
      stroke="currentColor" 
      strokeWidth="1.75" 
      strokeLinecap="round"
      strokeLinejoin="round" 
    />
    
    {/* Compute Cores Apertures & Synapse Bus */}
    <circle cx="9" cy="10.5" r="1.5" fill="currentColor" fillOpacity="0.85" />
    <circle cx="15" cy="10.5" r="1.5" fill="currentColor" fillOpacity="0.85" />
    <path 
      d="M10.5 10.5H13.5" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeOpacity="0.45" 
    />
  </svg>
);
