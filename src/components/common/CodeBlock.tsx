import React, { useState } from 'react';
import { Icon } from './Icon';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = (language || 'code').toUpperCase();
  const lines = code.split('\n');

  return (
    <div 
      className="code-block-wrapper squircle-md my-3"
      style={{
        borderRadius: 'var(--gc-radius-md)',
        border: '1px solid var(--gc-border)',
        background: 'var(--gc-surface-sunken)',
        overflow: 'hidden',
        boxShadow: 'var(--gc-shadow-sm)'
      }}
    >
      <div 
        className="code-block-header flex justify-between items-center px-3 py-1.5"
        style={{
          background: 'var(--gc-surface)',
          borderBottom: '1px solid var(--gc-border)'
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 opacity-70">
            <span className="w-2 h-2 rounded-full bg-red-500/70 inline-block" />
            <span className="w-2 h-2 rounded-full bg-amber-500/70 inline-block" />
            <span className="w-2 h-2 rounded-full bg-emerald-500/70 inline-block" />
          </div>
          <span className="text-mono text-[11px] font-semibold text-[var(--gc-text-muted)] tracking-wider">
            {displayLang}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="btn btn-ghost squircle-sm flex items-center gap-1.5"
          style={{
            fontSize: '11px',
            padding: '3px 9px',
            borderRadius: 'var(--gc-squircle-sm)',
            background: copied ? 'var(--gc-success-muted)' : 'var(--gc-surface-elevated)',
            color: copied ? 'var(--gc-success)' : 'var(--gc-text-muted)',
            border: '1px solid var(--gc-border)',
            cursor: 'pointer',
            transition: 'all 0.18s var(--gc-ease-g2)'
          }}
        >
          {copied ? <Icon name="check" size={13} className="text-success" /> : <Icon name="content_copy" size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div 
        className="code-block-content flex overflow-x-auto text-[12.5px] leading-relaxed p-3"
        style={{ fontFamily: 'var(--gc-font-mono)' }}
      >
        <div className="select-none pr-3 text-right text-[var(--gc-text-dim)] border-r border-[var(--gc-border)] mr-3 opacity-50 font-mono text-[11.5px] leading-relaxed">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 font-mono text-[var(--gc-text)] m-0 p-0 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
