import React from 'react';
import { Icon } from './Icon';
import { useTheme } from '../../hooks/useTheme';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', size = 'md' }) => {
  const { toggleTheme, isDark } = useTheme();

  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={`
        relative inline-flex items-center justify-center
        transition-all duration-250 ease-[cubic-bezier(0.175,0.885,0.32,1.15)]
        rounded-full cursor-pointer select-none
        border border-[var(--gc-border)]
        bg-[var(--gc-surface-elevated)]
        hover:border-[var(--gc-border-light)]
        hover:scale-110 active:scale-95
        text-[var(--gc-text)]
        shadow-sm
        ${isSmall ? 'w-7 h-7' : 'w-8 h-8'}
        ${className}
      `}
    >
      <span className="sr-only">Toggle theme</span>
      {isDark ? (
        <Icon 
          name="light_mode"
          size={isSmall ? 15 : 18} 
          className="text-amber-400 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] rotate-0 hover:rotate-90" 
        />
      ) : (
        <Icon 
          name="dark_mode"
          size={isSmall ? 15 : 18} 
          className="text-violet-600 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] -rotate-12 hover:rotate-0" 
        />
      )}
    </button>
  );
};
