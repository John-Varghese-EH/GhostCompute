import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select an option...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`
          w-full flex items-center justify-between
          px-3.5 py-2.5 rounded-xl text-left
          bg-[var(--gc-surface-sunken)]
          border border-[var(--gc-border)]
          text-[var(--gc-text)] text-[13px] font-medium
          hover:border-[var(--gc-border-light)]
          focus:outline-none focus:border-[var(--gc-accent)] focus:ring-2 focus:ring-[var(--gc-accent-muted)]
          transition-all duration-150 cursor-pointer
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? 'border-[var(--gc-accent)] ring-2 ring-[var(--gc-accent-muted)]' : ''}
        `}
      >
        <span className={`truncate ${!selectedOption && placeholder ? 'text-[var(--gc-text-muted)]' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon
          name="expand_more"
          size={18}
          className={`ml-2 text-[var(--gc-text-muted)] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--gc-accent)]' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div 
          className="
            absolute z-50 left-0 right-0 mt-1.5
            p-1.5 rounded-xl
            bg-[var(--gc-surface)]
            border border-[var(--gc-border-light)]
            shadow-xl backdrop-blur-2xl
            max-h-60 overflow-y-auto
            animate-fade-in
          "
          style={{
            boxShadow: '0 12px 32px -4px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--gc-border)'
          }}
        >
          {options.length === 0 ? (
            <div className="py-3 px-3 text-center text-xs text-[var(--gc-text-muted)]">
              No options available
            </div>
          ) : (
            options.map(opt => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`
                    w-full flex items-center justify-between
                    px-3 py-2 rounded-lg text-left text-xs
                    transition-colors cursor-pointer
                    ${isSelected 
                      ? 'bg-[var(--gc-accent-muted)] text-[var(--gc-accent)] font-semibold' 
                      : 'text-[var(--gc-text)] hover:bg-[var(--gc-surface-elevated)]'
                    }
                  `}
                >
                  <div className="truncate flex-1 pr-2">
                    <div className="truncate font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="text-[10px] text-[var(--gc-text-muted)] mt-0.5 truncate">
                        {opt.description}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Icon name="check" size={16} className="text-[var(--gc-accent)] shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
