import React from 'react';

export const Logo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 24, className = '', style }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ ...style, overflow: 'visible' }}
  >
    <style>
      {`
        @keyframes gc-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes gc-sparkle {
          0%, 100% { opacity: 0.4; transform: scale(0.8) translate(0, 0); }
          50% { opacity: 0.9; transform: scale(1.2) translate(0, -1px); }
        }
        .gc-ghost-body {
          animation: gc-float 4s ease-in-out infinite;
          transform-origin: center;
        }
        .gc-sparkle-1 {
          animation: gc-sparkle 3s ease-in-out infinite;
          transform-origin: 2px 7px;
        }
        .gc-sparkle-2 {
          animation: gc-sparkle 3s ease-in-out infinite 1s;
          transform-origin: 22px 15px;
        }
        .gc-sparkle-3 {
          animation: gc-sparkle 3s ease-in-out infinite 2s;
          transform-origin: 20px 5px;
        }
      `}
    </style>
    
    <g className="gc-ghost-body">
      {/* Cute Ghost Body with scalloped bottom */}
      <path 
        d="M12 2C7.58172 2 4 5.58172 4 10V20.5C4 21.3284 5 21.8284 5.58579 21.2426L7.29289 19.5355C7.68342 19.145 8.31658 19.145 8.70711 19.5355L11.2929 22.1213C11.6834 22.5118 12.3166 22.5118 12.7071 22.1213L15.2929 19.5355C15.6834 19.145 16.3166 19.145 16.7071 19.5355L18.4142 21.2426C19 21.8284 20 21.3284 20 20.5V10C20 5.58172 16.4183 2 12 2Z" 
        fill="currentColor" 
        fillOpacity="0.1" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinejoin="round" 
      />
      {/* Happy Eyes (closed cute curves) */}
      <path d="M7.5 10Q8.5 8.5 9.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 10Q15.5 8.5 16.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Cute little mouth */}
      <path d="M11 13Q12 14.5 13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* Compute / Tech elements - Floating sparkles/nodes */}
    <circle cx="2" cy="7" r="1" fill="currentColor" className="gc-sparkle-1" />
    <circle cx="22" cy="15" r="1" fill="currentColor" className="gc-sparkle-2" />
    <circle cx="20" cy="5" r="1.5" fill="currentColor" className="gc-sparkle-3" />
  </svg>
);
