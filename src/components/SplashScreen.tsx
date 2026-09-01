import React, { useEffect, useState } from 'react';
import { Logo } from './common/Logo';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('visible'), 50);
    const exitTimer = setTimeout(() => setPhase('exiting'), 2200);
    const unmountTimer = setTimeout(() => onComplete(), 3000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  const isVisible = phase === 'visible';
  const isExiting = phase === 'exiting';

  return (
    <div 
      className="flex flex-col items-center justify-center" 
      style={{ 
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000', // Pure black for true premium feel
        zIndex: 99999,
        opacity: isExiting ? 0 : 1,
        transition: 'opacity 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
        pointerEvents: isExiting ? 'none' : 'auto'
      }}
    >
      {/* Main Logo & Title */}
      <div 
        className="flex flex-col items-center" 
        style={{ 
          opacity: isVisible && !isExiting ? 1 : 0,
          transform: isVisible && !isExiting ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
          gap: '28px'
        }}
      >
        <Logo size={64} className="text-accent" />
        <h1 style={{ 
          fontSize: '22px', 
          fontWeight: 500, 
          letterSpacing: '0.04em',
          color: '#ffffff',
          fontFamily: 'var(--gc-font-ui)'
        }}>
          GhostCompute
        </h1>
      </div>

      {/* Credits */}
      <div 
        className="flex flex-col items-end" 
        style={{ 
          position: 'absolute', 
          bottom: '40px',
          right: '48px',
          opacity: isVisible && !isExiting ? 1 : 0,
          transform: isVisible && !isExiting ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s',
          gap: '6px',
          textAlign: 'right'
        }}
      >
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 600, 
          color: '#a1a1aa',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '2px'
        }}>
          JOHN VARGHESE (J0X)
        </span>
        <span style={{ 
          fontSize: '10px', 
          fontWeight: 500, 
          color: '#71717a',
          letterSpacing: '0.1em',
          textTransform: 'uppercase'
        }}>
          LINKEDIN: /IN/JOHN--VARGHESE
        </span>
        <span style={{ 
          fontSize: '10px', 
          fontWeight: 500, 
          color: '#71717a',
          letterSpacing: '0.1em',
          textTransform: 'uppercase'
        }}>
          GITHUB: JOHN-VARGHESE-EH
        </span>
      </div>
    </div>
  );
};
