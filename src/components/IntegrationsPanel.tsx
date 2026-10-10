import React, { useState } from 'react';
import { 
  LuBot, 
  LuBrain, 
  LuZap, 
  LuRefreshCw, 
  LuGlobe, 
  LuWrench, 
  LuPackage, 
  LuTerminal, 
  LuPlugZap, 
  LuCopy, 
  LuCheck 
} from 'react-icons/lu';
import { useApiProxy } from '../hooks/useApiProxy';
import { useSettings } from '../hooks/useSettings';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { StatusDot } from './common/StatusDot';
import { EmptyState } from './common/EmptyState';

export const IntegrationsPanel: React.FC = () => {
  const { status, start, stop } = useApiProxy();
  const { settings } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const integrations = [
    {
      id: 'claude-code',
      name: 'Claude Code',
      icon: <LuBot size={20} className="text-accent" />,
      description: 'Anthropic CLI assistant',
      config: `ANTHROPIC_BASE_URL=http://localhost:${status.port}/v1`,
      instructions: 'Set this environment variable before running Claude Code CLI'
    },
    {
      id: 'openai-codex',
      name: 'OpenAI Codex CLI',
      icon: <LuBrain size={20} className="text-accent" />,
      description: 'OpenAI CLI tools',
      config: `OPENAI_BASE_URL=http://localhost:${status.port}/v1`,
      instructions: 'Set this environment variable before running the Codex CLI'
    },
    {
      id: 'cursor',
      name: 'Cursor',
      icon: <LuZap size={20} className="text-accent" />,
      description: 'AI-powered code editor',
      config: `{ "openai.apiBase": "http://localhost:${status.port}/v1" }`,
      instructions: 'Open Cursor Settings > Models > OpenAI API Base'
    },
    {
      id: 'continue-dev',
      name: 'Continue.dev',
      icon: <LuRefreshCw size={20} className="text-accent" />,
      description: 'IDE extension',
      config: `{
  "title": "GhostCompute",
  "provider": "openai",
  "model": "ghost-model",
  "apiBase": "http://localhost:${status.port}/v1"
}`,
      instructions: 'Add to your Continue config.json providers array'
    },
    {
      id: 'open-webui',
      name: 'Open WebUI',
      icon: <LuGlobe size={20} className="text-accent" />,
      description: 'Web frontend for LLMs',
      config: `http://localhost:${status.port}`,
      instructions: 'Go to Settings > Connections > Add OpenAI-compatible endpoint'
    },
    {
      id: 'aider',
      name: 'Aider',
      icon: <LuWrench size={20} className="text-accent" />,
      description: 'AI pair programming in your terminal',
      config: `aider --openai-api-base http://localhost:${status.port}/v1`,
      instructions: 'Pass this flag when launching Aider'
    },
    {
      id: 'lm-studio',
      name: 'LM Studio',
      icon: <LuPackage size={20} className="text-accent" />,
      description: 'Desktop LLM app',
      config: `http://localhost:${status.port}/v1`,
      instructions: 'Use this as the server URL in LM Studio client'
    },
    {
      id: 'curl',
      name: 'cURL / API',
      icon: <LuTerminal size={20} className="text-accent" />,
      description: 'Direct REST API calls',
      config: `curl http://localhost:${status.port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
${settings.api_proxy_key ? `  -H "Authorization: Bearer ${settings.api_proxy_key}" \\\n` : ''}  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
      instructions: 'Use this template for direct API calls'
    }
  ];

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex justify-between items-center">
        <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Auto-Configure & Integrations</h2>
        <Badge variant={status.running ? 'success' : 'danger'}>
          {status.running ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      <div className="card flex flex-col gap-md">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-sm">
            <h3 style={{ fontSize: '16px', fontWeight: 500 }}>API Proxy Server</h3>
            <StatusDot status={status.running ? 'active' : 'idle'} />
          </div>
          <Button 
            variant={status.running ? 'danger' : 'primary'}
            onClick={status.running ? stop : start}
          >
            {status.running ? 'Stop Proxy' : 'Start Proxy'}
          </Button>
        </div>

        <div className="flex gap-lg">
          <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
            <label style={{ fontSize: '14px', fontWeight: 500 }} className="text-muted">Endpoint URL</label>
            <div className="flex gap-sm items-center">
              <code className="text-mono" style={{ background: 'var(--gc-bg)', padding: '6px 10px', borderRadius: '4px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {status.endpoint || `http://localhost:${status.port}`}
              </code>
              <Button size="sm" variant="ghost" onClick={() => handleCopy(status.endpoint || `http://localhost:${status.port}`, 'endpoint')}>
                {copiedId === 'endpoint' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
            <label style={{ fontSize: '14px', fontWeight: 500 }} className="text-muted">API Key</label>
            <div className="flex gap-sm items-center">
              <code className="text-mono" style={{ background: 'var(--gc-bg)', padding: '6px 10px', borderRadius: '4px', flex: 1 }}>
                {settings.api_proxy_key ? (showKey ? settings.api_proxy_key : '••••••••••••••••') : 'No key required'}
              </code>
              {settings.api_proxy_key && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(settings.api_proxy_key || '', 'apikey')} className="flex items-center gap-xs">
                    {copiedId === 'apikey' ? <LuCheck size={13} className="text-success" /> : <LuCopy size={13} />}
                    <span>{copiedId === 'apikey' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {!status.running ? (
        <EmptyState 
          icon={<LuPlugZap size={24} />} 
          title="API Proxy Offline" 
          description="Start the OpenAI-compatible API proxy above to expose local endpoints for Cursor, Claude Code, and Continue." 
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gc-space-md)' }}>
          {integrations.map(integration => (
            <div 
              key={integration.id} 
              className="card glass-panel flex flex-col"
              style={{ 
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'default'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--gc-space-sm)' }}>
                <div 
                  className="flex items-center justify-center"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--gc-radius-md)',
                    background: 'var(--gc-accent-muted)',
                    border: '1px solid var(--gc-border)'
                  }}
                >
                  {integration.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{integration.name}</div>
                  <div className="text-muted" style={{ fontSize: '13px' }}>{integration.description}</div>
                </div>
              </div>
              
              <div style={{ 
                background: 'var(--gc-bg)', 
                padding: 'var(--gc-space-sm)', 
                borderRadius: '4px',
                marginTop: 'auto',
                marginBottom: 'var(--gc-space-sm)',
                overflowX: 'auto'
              }}>
                <pre className="text-mono" style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  {integration.config}
                </pre>
              </div>

              <div className="flex justify-between items-center" style={{ marginTop: 'auto' }}>
                <button
                  onClick={() => setExpandedId(expandedId === integration.id ? null : integration.id)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--gc-accent)', 
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: 0
                  }}
                >
                  {expandedId === integration.id ? 'Hide Setup' : 'Show Setup'}
                </button>
                <Button 
                  size="sm" 
                  onClick={() => handleCopy(integration.config, integration.id)}
                  className="flex items-center gap-xs"
                >
                  {copiedId === integration.id ? <LuCheck size={13} className="text-success" /> : <LuCopy size={13} />}
                  <span>{copiedId === integration.id ? 'Copied' : 'Copy Config'}</span>
                </Button>
              </div>

              {expandedId === integration.id && (
                <div 
                  className="text-muted" 
                  style={{ 
                    marginTop: 'var(--gc-space-sm)', 
                    paddingTop: 'var(--gc-space-sm)', 
                    borderTop: '1px solid var(--gc-border)',
                    fontSize: '13px'
                  }}
                >
                  {integration.instructions}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
