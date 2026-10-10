import React, { useState } from 'react';
import { LuCopy, LuCheck } from 'react-icons/lu';

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

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="text-mono" style={{ letterSpacing: '0.05em', fontWeight: 600 }}>
          {displayLang}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="btn btn-ghost flex items-center gap-xs"
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: 'var(--gc-radius-sm)',
            background: copied ? 'rgba(50, 215, 75, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            color: copied ? 'var(--gc-success)' : 'var(--gc-text-muted)',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="code-block-content">
        <code>{code}</code>
      </div>
    </div>
  );
};
