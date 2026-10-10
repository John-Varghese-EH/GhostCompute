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
  LuCheck,
  LuPlay,
  LuCircleCheck,
  LuCircleAlert
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
  const [activeCategory, setActiveCategory] = useState<'all' | 'editor' | 'cli' | 'app'>('all');
  const [shellMode, setShellMode] = useState<'powershell' | 'bash' | 'cmd'>(() => {
    if (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || navigator.platform)) {
      return 'powershell';
    }
    return 'bash';
  });
  
  // Diagnostic test runner state
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ status: number; latencyMs: number; modelsCount: number; errorMsg?: string } | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunDiagnostic = async () => {
    setTestState('testing');
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`http://127.0.0.1:${status.port}/v1/models`, {
        signal: controller.signal,
        headers: settings.api_proxy_key ? { 'Authorization': `Bearer ${settings.api_proxy_key}` } : {}
      });
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const count = Array.isArray(json?.data) ? json.data.length : 1;
        setTestResult({ status: res.status, latencyMs, modelsCount: count });
        setTestState('success');
      } else {
        setTestResult({ status: res.status, latencyMs, modelsCount: 0, errorMsg: `HTTP ${res.status} ${res.statusText}` });
        setTestState('error');
      }
    } catch (e: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setTestResult({ status: 0, latencyMs, modelsCount: 0, errorMsg: e?.message || 'Connection refused' });
      setTestState('error');
    }
  };

  const integrations = [
    {
      id: 'cursor',
      category: 'editor',
      name: 'Cursor',
      icon: <LuZap size={20} className="text-accent" />,
      description: 'AI-first code editor with inline edits and agent terminal',
      config: `{ "openai.apiBase": "http://localhost:${status.port}/v1" }`,
      instructions: 'Open Cursor Settings > Models > OpenAI API Base. Disable "OpenAI API Key" or enter any dummy key.'
    },
    {
      id: 'continue-dev',
      category: 'editor',
      name: 'Continue.dev',
      icon: <LuRefreshCw size={20} className="text-accent" />,
      description: 'Open-source VS Code & JetBrains AI copilot extension',
      config: `{
  "title": "GhostCompute Local",
  "provider": "openai",
  "model": "ghost-remote",
  "apiBase": "http://localhost:${status.port}/v1"
}`,
      instructions: 'Add this block to your Continue config.json providers array.'
    },
    {
      id: 'claude-code',
      category: 'cli',
      name: 'Claude Code CLI',
      icon: <LuBot size={20} className="text-accent" />,
      description: 'Terminal agent for coding, debugging, and git tasks',
      config: shellMode === 'powershell'
        ? `$env:ANTHROPIC_BASE_URL = "http://localhost:${status.port}/v1"`
        : shellMode === 'cmd'
        ? `set ANTHROPIC_BASE_URL=http://localhost:${status.port}/v1`
        : `export ANTHROPIC_BASE_URL="http://localhost:${status.port}/v1"`,
      instructions: shellMode === 'powershell'
        ? 'Run in PowerShell before launching Claude Code CLI.'
        : shellMode === 'cmd'
        ? 'Run in Windows Command Prompt before launching Claude Code CLI.'
        : 'Export this environment variable in your terminal session before launching Claude Code.'
    },
    {
      id: 'openai-codex',
      category: 'cli',
      name: 'OpenAI Codex & CLI',
      icon: <LuBrain size={20} className="text-accent" />,
      description: 'Official and community OpenAI command-line developer utilities',
      config: shellMode === 'powershell'
        ? `$env:OPENAI_BASE_URL = "http://localhost:${status.port}/v1"\n$env:OPENAI_API_KEY = "${settings.api_proxy_key || 'sk-ghostcompute'}"`
        : shellMode === 'cmd'
        ? `set OPENAI_BASE_URL=http://localhost:${status.port}/v1\nset OPENAI_API_KEY=${settings.api_proxy_key || 'sk-ghostcompute'}`
        : `export OPENAI_BASE_URL="http://localhost:${status.port}/v1"\nexport OPENAI_API_KEY="${settings.api_proxy_key || 'sk-ghostcompute'}"`,
      instructions: shellMode === 'powershell'
        ? 'Run in PowerShell before invoking OpenAI CLI tools.'
        : shellMode === 'cmd'
        ? 'Run in Command Prompt or set in Windows System Environment Variables.'
        : 'Set both OPENAI_BASE_URL and OPENAI_API_KEY in your terminal ~/.bashrc or ~/.zshrc.'
    },
    {
      id: 'aider',
      category: 'cli',
      name: 'Aider AI Pair Programmer',
      icon: <LuWrench size={20} className="text-accent" />,
      description: 'Pair programming in your git repo with automated commits',
      config: `aider --openai-api-base http://localhost:${status.port}/v1 --model openai/default`,
      instructions: 'Pass the --openai-api-base flag when launching Aider from your repository root.'
    },
    {
      id: 'open-webui',
      category: 'app',
      name: 'Open WebUI',
      icon: <LuGlobe size={20} className="text-accent" />,
      description: 'Full-featured web ChatGPT interface for self-hosted models',
      config: `http://localhost:${status.port}/v1`,
      instructions: 'Navigate to Admin Panel > Settings > Connections > Add OpenAI API Connection.'
    },
    {
      id: 'lm-studio',
      category: 'app',
      name: 'LM Studio & Chat Clients',
      icon: <LuPackage size={20} className="text-accent" />,
      description: 'Desktop client and GUI chat interfaces',
      config: `http://localhost:${status.port}/v1`,
      instructions: 'Set the custom server endpoint to this URL inside the client connection dialog.'
    },
    {
      id: 'curl',
      category: 'app',
      name: 'REST API & cURL',
      icon: <LuTerminal size={20} className="text-accent" />,
      description: 'Standard OpenAI-compatible /v1/chat/completions endpoint',
      config: shellMode === 'powershell'
        ? `curl.exe -X POST http://localhost:${status.port}/v1/chat/completions \`
  -H "Content-Type: application/json" \`
${settings.api_proxy_key ? `  -H "Authorization: Bearer ${settings.api_proxy_key}" \`\n` : ''}  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello remote GPU!"}],
    "stream": false
  }'`
        : shellMode === 'cmd'
        ? `curl -X POST http://localhost:${status.port}/v1/chat/completions ^
  -H "Content-Type: application/json" ^
${settings.api_proxy_key ? `  -H "Authorization: Bearer ${settings.api_proxy_key}" ^\n` : ''}  -d "{\\"model\\": \\"default\\", \\"messages\\": [{\\"role\\": \\"user\\", \\"content\\": \\"Hello remote GPU!\\"}]}"`
        : `curl -X POST http://localhost:${status.port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
${settings.api_proxy_key ? `  -H "Authorization: Bearer ${settings.api_proxy_key}" \\\n` : ''}  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello remote GPU!"}],
    "stream": false
  }'`,
      instructions: 'Direct HTTP POST endpoint compatible with any standard HTTP library (Python, Node, Go, Rust).'
    }
  ];

  const filteredIntegrations = activeCategory === 'all'
    ? integrations
    : integrations.filter(i => i.category === activeCategory);

  return (
    <div className="flex flex-col gap-xl" style={{ maxWidth: '960px', margin: '0 auto' }}>
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.3px' }}>OpenAI Proxy & Integrations</h2>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
            Seamlessly forward any OpenAI-compatible IDE, CLI, or agent to your remote laptop's GPU compute.
          </p>
        </div>
        <Badge variant={status.running ? 'success' : 'danger'}>
          {status.running ? 'Proxy Active' : 'Proxy Stopped'}
        </Badge>
      </div>

      {/* Main Server Card */}
      <div className="card glass-panel flex flex-col gap-md" style={{ padding: '20px' }}>
        <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--gc-border)', paddingBottom: '14px' }}>
          <div className="flex items-center gap-sm">
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Local Compatibility Gateway</h3>
            <StatusDot status={status.running ? 'active' : 'idle'} />
          </div>
          <div className="flex items-center gap-sm">
            <Button 
              variant={status.running ? 'danger' : 'primary'}
              size="sm"
              onClick={status.running ? stop : start}
            >
              {status.running ? 'Stop Gateway' : 'Start Gateway'}
            </Button>
          </div>
        </div>

        {/* Endpoints & Key Grid */}
        <div className="flex flex-wrap gap-lg" style={{ marginTop: '4px' }}>
          
          <div className="flex flex-col gap-xs" style={{ flex: '1 1 280px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} className="text-muted">
              Base Endpoint URL
            </label>
            <div className="flex gap-sm items-center">
              <code className="text-mono" style={{ background: 'var(--gc-bg)', padding: '7px 12px', borderRadius: 'var(--gc-radius-sm)', flex: 1, fontSize: '13px', border: '1px solid var(--gc-border)' }}>
                {status.endpoint || `http://localhost:${status.port}`}
              </code>
              <Button size="sm" variant="ghost" onClick={() => handleCopy(status.endpoint || `http://localhost:${status.port}`, 'endpoint')}>
                {copiedId === 'endpoint' ? <LuCheck size={13} className="text-success" /> : <LuCopy size={13} />}
                <span>{copiedId === 'endpoint' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-xs" style={{ flex: '1 1 280px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} className="text-muted">
              Authentication Key
            </label>
            <div className="flex gap-sm items-center">
              <code className="text-mono" style={{ background: 'var(--gc-bg)', padding: '7px 12px', borderRadius: 'var(--gc-radius-sm)', flex: 1, fontSize: '13px', border: '1px solid var(--gc-border)' }}>
                {settings.api_proxy_key ? (showKey ? settings.api_proxy_key : '••••••••••••••••') : 'No auth required (Local-only)'}
              </code>
              {settings.api_proxy_key && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(settings.api_proxy_key || '', 'apikey')}>
                    {copiedId === 'apikey' ? <LuCheck size={13} className="text-success" /> : <LuCopy size={13} />}
                    <span>{copiedId === 'apikey' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </>
              )}
            </div>
          </div>

        </div>

        {/* Live Diagnostic Tester Bar */}
        <div 
          className="flex flex-wrap items-center justify-between gap-sm"
          style={{ 
            background: 'rgba(255, 255, 255, 0.02)', 
            padding: '10px 14px', 
            borderRadius: 'var(--gc-radius-md)',
            border: '1px solid var(--gc-border)',
            marginTop: '4px'
          }}
        >
          <div className="flex items-center gap-sm">
            <button
              onClick={handleRunDiagnostic}
              disabled={testState === 'testing' || !status.running}
              className="btn btn-ghost flex items-center gap-xs"
              style={{ fontSize: '12px', padding: '4px 10px', background: 'rgba(255, 255, 255, 0.04)' }}
            >
              {testState === 'testing' ? <span className="spinner" /> : <LuPlay size={12} className="text-accent" />}
              <span>{testState === 'testing' ? 'Testing Proxy...' : 'Test Local Endpoint'}</span>
            </button>

            {testState === 'success' && testResult && (
              <span className="badge badge-success flex items-center gap-xs" style={{ fontSize: '11px', textTransform: 'none' }}>
                <LuCircleCheck size={13} />
                <span>200 OK • {testResult.latencyMs}ms latency • {testResult.modelsCount} model(s) ready</span>
              </span>
            )}

            {testState === 'error' && (
              <span className="badge badge-danger flex items-center gap-xs" style={{ fontSize: '11px', textTransform: 'none' }}>
                <LuCircleAlert size={13} />
                <span>Diagnostic Failed: {testResult?.errorMsg || 'Connection refused'}</span>
              </span>
            )}

            {testState === 'idle' && (
              <span className="text-muted" style={{ fontSize: '12px' }}>
                Sends a live test request to <code className="text-mono">/v1/models</code> to verify proxy responsiveness.
              </span>
            )}
          </div>

          <span className="text-mono text-muted" style={{ fontSize: '11px' }}>
            OpenAI API v1 Spec Compatible
          </span>
        </div>

      </div>

      {!status.running ? (
        <EmptyState 
          icon={<LuPlugZap size={26} />} 
          title="API Gateway Offline" 
          description="Click 'Start Gateway' above to expose your local OpenAI-compatible endpoint for Cursor, Claude Code, Continue, and other developer tools." 
        />
      ) : (
        <div className="flex flex-col gap-md">
          
          {/* Category Filter & Shell Selector Controls */}
          <div className="flex flex-wrap items-center justify-between gap-sm" style={{ borderBottom: '1px solid var(--gc-border)', paddingBottom: '12px' }}>
            <div className="segmented-control">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`segmented-item ${activeCategory === 'all' ? 'active' : ''}`}
              >
                All Tools ({integrations.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('editor')}
                className={`segmented-item ${activeCategory === 'editor' ? 'active' : ''}`}
              >
                IDEs & Editors
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('cli')}
                className={`segmented-item ${activeCategory === 'cli' ? 'active' : ''}`}
              >
                CLIs
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('app')}
                className={`segmented-item ${activeCategory === 'app' ? 'active' : ''}`}
              >
                Apps & API
              </button>
            </div>

            <div className="flex items-center gap-xs">
              <span className="text-muted" style={{ fontSize: '11px', marginRight: '4px' }}>Shell:</span>
              <div className="segmented-control">
                <button
                  type="button"
                  onClick={() => setShellMode('powershell')}
                  className={`segmented-item ${shellMode === 'powershell' ? 'active' : ''}`}
                >
                  PowerShell
                </button>
                <button
                  type="button"
                  onClick={() => setShellMode('cmd')}
                  className={`segmented-item ${shellMode === 'cmd' ? 'active' : ''}`}
                >
                  CMD
                </button>
                <button
                  type="button"
                  onClick={() => setShellMode('bash')}
                  className={`segmented-item ${shellMode === 'bash' ? 'active' : ''}`}
                >
                  Bash / Zsh
                </button>
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--gc-space-md)' }}>
            {filteredIntegrations.map((integration) => (
              <div 
                key={integration.id} 
                className="card glass-panel flex flex-col"
                style={{ 
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  padding: '18px'
                }}
              >
                <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--gc-space-sm)' }}>
                  <div 
                    className="flex items-center justify-center"
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--gc-radius-md)',
                      background: 'var(--gc-accent-muted)',
                      border: '1px solid var(--gc-border)'
                    }}
                  >
                    {integration.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{integration.name}</div>
                    <div className="text-muted" style={{ fontSize: '12px', lineHeight: 1.3 }}>{integration.description}</div>
                  </div>
                </div>
                
                <div style={{ 
                  background: 'var(--gc-bg)', 
                  padding: '10px 12px', 
                  borderRadius: 'var(--gc-radius-sm)',
                  marginTop: 'auto',
                  marginBottom: 'var(--gc-space-sm)',
                  border: '1px solid var(--gc-border)',
                  overflowX: 'auto'
                }}>
                  <pre className="text-mono" style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', color: '#e4e4e7' }}>
                    {integration.config}
                  </pre>
                </div>

                <div className="flex justify-between items-center" style={{ marginTop: 'auto', paddingTop: '4px' }}>
                  <button
                    onClick={() => setExpandedId(expandedId === integration.id ? null : integration.id)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--gc-accent)', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: 0
                    }}
                  >
                    {expandedId === integration.id ? 'Hide Instructions' : 'Setup Instructions'}
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
                      fontSize: '12px',
                      lineHeight: 1.4
                    }}
                  >
                    {integration.instructions}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}

    </div>
  );
};
