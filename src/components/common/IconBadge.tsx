import React from 'react';

export interface IconBadgeProps {
  icon: React.ReactNode;
  variant?: 'accent' | 'emerald' | 'blue' | 'amber' | 'rose' | 'neutral';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const variantStyles: Record<string, { bg: string; border: string; text: string; glowColor: string }> = {
  accent: {
    bg: 'bg-gradient-to-b from-violet-500/15 to-violet-900/30',
    border: 'border-violet-500/25',
    text: 'text-violet-300',
    glowColor: 'rgba(139, 92, 246, 0.25)',
  },
  emerald: {
    bg: 'bg-gradient-to-b from-emerald-500/15 to-emerald-950/30',
    border: 'border-emerald-500/25',
    text: 'text-emerald-300',
    glowColor: 'rgba(16, 185, 129, 0.25)',
  },
  blue: {
    bg: 'bg-gradient-to-b from-sky-500/15 to-blue-950/30',
    border: 'border-sky-500/25',
    text: 'text-sky-300',
    glowColor: 'rgba(56, 189, 248, 0.25)',
  },
  amber: {
    bg: 'bg-gradient-to-b from-amber-500/15 to-amber-950/30',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    glowColor: 'rgba(245, 158, 11, 0.25)',
  },
  rose: {
    bg: 'bg-gradient-to-b from-rose-500/15 to-rose-950/30',
    border: 'border-rose-500/25',
    text: 'text-rose-300',
    glowColor: 'rgba(244, 63, 94, 0.25)',
  },
  neutral: {
    bg: 'bg-gradient-to-b from-white/[0.08] to-white/[0.02]',
    border: 'border-white/10',
    text: 'text-zinc-300',
    glowColor: 'rgba(255, 255, 255, 0.08)',
  },
};

const sizeStyles = {
  xs: 'w-6 h-6 rounded-md text-[12px]',
  sm: 'w-8 h-8 rounded-lg text-[14px]',
  md: 'w-10 h-10 rounded-xl text-[18px]',
  lg: 'w-12 h-12 rounded-2xl text-[22px]',
};

export const IconBadge: React.FC<IconBadgeProps> = ({
  icon,
  variant = 'accent',
  size = 'md',
  glow = false,
  className = '',
  style,
}) => {
  const currentVariant = variantStyles[variant] || variantStyles.accent;
  const currentSize = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      className={`
        inline-flex items-center justify-center shrink-0
        border backdrop-blur-md select-none
        shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]
        transition-all duration-200
        ${currentVariant.bg}
        ${currentVariant.border}
        ${currentVariant.text}
        ${currentSize}
        ${className}
      `}
      style={{
        boxShadow: glow
          ? `0 0 16px ${currentVariant.glowColor}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        ...style,
      }}
    >
      {icon}
    </div>
  );
};
