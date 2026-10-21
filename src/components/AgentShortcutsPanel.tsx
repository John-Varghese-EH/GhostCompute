import React, { useState } from 'react';
import { 
  Bot, 
  Check, 
  Copy, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  Globe,
  Terminal,
  Cpu,
  Image,
  Zap,
  Brain,
  Boxes,
  Share2,
  Network,
  Code2,
  Database
} from 'lucide-react';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { IconBadge } from './common/IconBadge';

interface AgentShortcutsPanelProps {
  isConnected: boolean;
  tunnelUrl?: string | null;
  onNavigatePairing?: () => void;
}

export const AgentShortcutsPanel: React.FC<AgentShortcutsPanelProps> = ({
  isConnected,
  tunnelUrl,
  onNavigatePairing,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showOfflineModal, setShowOfflineModal] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleLaunchWebTool = (toolName: string, defaultPort: number, path: string = '/') => {
    if (!isConnected) {
      setShowOfflineModal(toolName);
      return;
    }

    // When connected, open remote dashboard either via local proxy or direct tunnel
    const targetUrl = tunnelUrl
      ? `${tunnelUrl}${path}`
      : `http://localhost:${defaultPort}${path}`;
    window.open(targetUrl, '_blank');
  };

  const handleCreateDesktopShortcut = (name: string, port: number, path: string = '/') => {
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || navigator.platform);
    const url = `http://localhost:${port}${path}`;
    
    if (isWindows) {
      const urlContent = `[InternetShortcut]\nURL=${url}\nIconIndex=0\n`;
      const blob = new Blob([urlContent], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `GhostCompute - ${name}.url`;
      link.click();
    } else {
      const desktopContent = `[Desktop Entry]\nName=GhostCompute - ${name}\nComment=Launch ${name} via GhostCompute Remote Compute\nExec=xdg-open ${url}\nTerminal=false\nType=Application\nIcon=utilities-terminal\nCategories=Development;AI;\n`;
      const blob = new Blob([desktopContent], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${name.toLowerCase().replace(/\s+/g, '-')}.desktop`;
      link.click();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Bot size={22} className="text-violet-400" />
          <span>Smart Agent & Coding Assistant Auto-Config</span>
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Route <span className="text-zinc-200 font-medium">Claude Code, Antigravity, Cursor, and Continue</span> through your remote Gaming PC GPU via the authenticated local proxy daemon (<code className="text-violet-300 font-mono">127.0.0.1:11434</code>).
        </p>
      </div>

      {/* Connection Notice */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${
        isConnected 
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center gap-3">
          {isConnected ? <Wifi size={18} /> : <WifiOff size={18} />}
          <div>
            <div className="text-sm font-semibold">
              {isConnected ? 'Local Proxy Active (127.0.0.1:11434)' : 'Host Disconnected'}
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              {isConnected 
                ? 'Local agents will transparently send inference requests over the encrypted tunnel to the Host.' 
                : 'Connect to your GhostCompute Host PC first to enable local proxy routing.'}
            </div>
          </div>
        </div>
        {!isConnected && onNavigatePairing && (
          <Button size="sm" variant="primary" onClick={onNavigatePairing} className="text-xs">
            Connect Host
          </Button>
        )}
      </div>

      {/* Coding Agents 1-Click Configs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claude Code */}
        <div className="double-bezel group hover:border-violet-500/30 transition-all">
          <div className="double-bezel-inner h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={<Terminal size={17} />} variant="amber" size="md" className="group-hover:scale-105" />
                  <div>
                    <h3 className="text-sm font-bold text-[var(--gc-text)] group-hover:text-accent transition-colors">Claude Code</h3>
                    <div className="text-[11px] text-[var(--gc-text-muted)] font-mono">Terminal CLI Agent</div>
                  </div>
                </div>
                <Badge variant="info">Ollama Provider</Badge>
              </div>
              <p className="text-xs text-[var(--gc-text-muted)] mt-3 leading-relaxed">
                Direct Claude Code CLI to consume the remote Gaming PC's GPU inference endpoint as its backend model.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--gc-border)] flex flex-col gap-2">
              <div className="bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] rounded-xl p-2.5 font-mono text-xs text-[var(--gc-text)] flex items-center justify-between">
                <code className="text-accent select-all">export OLLAMA_HOST=http://127.0.0.1:11434</code>
                <button
                  onClick={() => copyToClipboard('export OLLAMA_HOST=http://127.0.0.1:11434 && claude --provider ollama', 'claude')}
                  className="p-1.5 rounded-lg hover:bg-[var(--gc-border)] text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] transition-colors cursor-pointer"
                  title="Copy shell export command"
                >
                  {copiedKey === 'claude' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-[11px] text-[var(--gc-text-muted)]">
                Run <code className="text-[var(--gc-text)] font-mono bg-[var(--gc-surface-sunken)] px-1 rounded">claude --provider ollama --model &lt;model&gt;</code> in your project.
              </div>
            </div>
          </div>
        </div>

        {/* Antigravity / Cursor / Continue */}
        <div className="double-bezel group hover:border-violet-500/30 transition-all">
          <div className="double-bezel-inner h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={<Cpu size={17} />} variant="accent" size="md" className="group-hover:scale-105" />
                  <div>
                    <h3 className="text-sm font-bold text-[var(--gc-text)] group-hover:text-accent transition-colors">Antigravity & Cursor</h3>
                    <div className="text-[11px] text-[var(--gc-text-muted)] font-mono">OpenAI /v1 Compatible</div>
                  </div>
                </div>
                <Badge variant="success">OpenAI /v1</Badge>
              </div>
              <p className="text-xs text-[var(--gc-text-muted)] mt-3 leading-relaxed">
                Configure Cursor or Antigravity to point to the local OpenAI compatibility proxy with streaming token completions.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--gc-border)] flex flex-col gap-2">
              <div className="bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] rounded-xl p-2.5 font-mono text-xs text-[var(--gc-text)] flex items-center justify-between">
                <code className="text-accent select-all">http://127.0.0.1:11434/v1</code>
                <button
                  onClick={() => copyToClipboard('http://127.0.0.1:11434/v1', 'cursor')}
                  className="p-1.5 rounded-lg hover:bg-[var(--gc-border)] text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] transition-colors cursor-pointer"
                  title="Copy Base URL"
                >
                  {copiedKey === 'cursor' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-[11px] text-[var(--gc-text-muted)]">
                Base URL: <code className="text-[var(--gc-text)] font-mono bg-[var(--gc-surface-sunken)] px-1 rounded">http://127.0.0.1:11434/v1</code> • API Key: any string
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Web Tool Shortcuts with Connection-Aware Interceptor */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Globe size={18} className="text-violet-400" />
            <span>Heavy Web-UI Shortcuts (Connection-Aware Routing)</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Click "Launch" to access web apps hosted on your Gaming PC. If the server is offline, GhostCompute intercepts the request with a reconnect screen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: 'Open WebUI', port: 3000, desc: 'Chat, model weights & RAG workspace', icon: <Globe size={18} />, variant: 'blue' as const },
            { name: 'ComfyUI', port: 8188, desc: 'Stable Diffusion node workflows', icon: <Image size={18} />, variant: 'rose' as const },
            { name: 'n8n', port: 5678, desc: 'Self-hosted AI agent workflows', icon: <Zap size={18} />, variant: 'amber' as const },
            { name: 'AnythingLLM', port: 3001, desc: 'Full RAG document search workspace', icon: <Brain size={18} />, variant: 'blue' as const },
            { name: 'Dify', port: 3100, desc: 'Visual LLM application & agent platform', icon: <Boxes size={18} />, variant: 'amber' as const },
            { name: 'Flowise', port: 3002, desc: 'Drag-and-drop LLM orchestration flows', icon: <Share2 size={18} />, variant: 'accent' as const },
            { name: 'Langflow', port: 7860, desc: 'Multi-agent visual framework', icon: <Network size={18} />, variant: 'accent' as const },
            { name: 'Tabby', port: 8082, desc: 'Self-hosted code assistant web dashboard', icon: <Code2 size={18} />, variant: 'emerald' as const },
            { name: 'Qdrant', port: 6333, desc: 'High-performance vector memory database', path: '/dashboard', icon: <Database size={18} />, variant: 'emerald' as const },
          ].map(tool => (
            <div key={tool.name} className="double-bezel group hover:border-violet-500/30 transition-all">
              <div className="double-bezel-inner p-3.5 flex flex-col justify-between h-full bg-[#0d0d16]">
                <div className="flex items-start gap-2.5">
                  <IconBadge icon={tool.icon} variant={tool.variant} size="sm" className="group-hover:scale-105 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white text-sm group-hover:text-violet-300 transition-colors">{tool.name}</div>
                    <div className="text-[11px] text-muted mt-0.5 leading-snug">{tool.desc}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleLaunchWebTool(tool.name, tool.port, tool.path || '/')}
                    className="flex-1 text-xs py-1.5 active:scale-[0.98]"
                  >
                    Launch App
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCreateDesktopShortcut(tool.name, tool.port, tool.path || '/')}
                    title="Create Desktop Shortcut"
                    className="text-xs text-muted hover:text-white py-1.5"
                  >
                    Shortcut
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Offline Intercept Modal */}
      {showOfflineModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-amber-500/30 p-6 flex flex-col items-center text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">GhostCompute Server Offline</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Cannot launch <span className="text-white font-semibold">{showOfflineModal}</span> because your laptop is currently disconnected from your Gaming PC host.
            </p>
            <div className="w-full mt-6 flex flex-col gap-2">
              {onNavigatePairing && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowOfflineModal(null);
                    onNavigatePairing();
                  }}
                  className="w-full text-xs"
                >
                  Reconnect to Host Now
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => setShowOfflineModal(null)}
                className="w-full text-xs text-zinc-400"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
