import React, { useState, useEffect } from 'react';
import { 
  LuLayers, 
  LuSmartphone, 
  LuCpu, 
  LuBox, 
  LuSettings, 
  LuPlugZap, 
  LuCopy, 
  LuCheck, 
  LuWifi, 
  LuGlobe,
  LuDownload,
  LuInfo,
  LuStore,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuEye,
  LuEyeOff,
  LuRotateCcw,
  LuSave,
  LuExternalLink
} from 'react-icons/lu';
import { useHosting } from '../hooks/useHosting';
import { useOllama } from '../hooks/useOllama';
import { useSettings } from '../hooks/useSettings';
import { getPairedDevices, revokeDevice, TrustedPeer, generatePairingLink, getLocalIp, AppSettings } from '../lib/tauri';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { StatusDot } from './common/StatusDot';
import { EmptyState } from './common/EmptyState';
import { Logo } from './common/Logo';
import { IntegrationsPanel } from './IntegrationsPanel';
import { AppStoreCatalog } from './AppStoreCatalog';
import { UserManagementPanel } from './UserManagementPanel';
import { ThemeToggle } from './common/ThemeToggle';
import { CustomSelect } from './common/CustomSelect';

interface HostConsoleProps {
  onResetRole: () => void;
}

export const HostConsole: React.FC<HostConsoleProps> = ({ onResetRole }) => {
  const [activeNav, setActiveNav] = useState<'sessions' | 'catalog' | 'users' | 'devices' | 'model' | 'integrations' | 'settings'>('sessions');
  const { isHosting, sessions, startHosting, stopHosting, killSession } = useHosting();
  const { status: ollamaStatus, models, pullModel, swapModel } = useOllama();
  const { settings, save } = useSettings();
  
  // Local form state for Settings to prevent keystroke save jitter
  const [formSettings, setFormSettings] = useState<AppSettings | null>(null);
  const [tunnelMode, setTunnelMode] = useState<'quick' | 'named'>('quick');
  const [showToken, setShowToken] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [devices, setDevices] = useState<TrustedPeer[]>([]);
  const [pairingLink, setPairingLink] = useState('');
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [copiedLan, setCopiedLan] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [tunnelOs, setTunnelOs] = useState<'powershell' | 'cmd' | 'bash'>(() => {
    if (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || navigator.platform)) {
      return 'powershell';
    }
    return 'bash';
  });

  // Sync formSettings when settings load or update
  useEffect(() => {
    if (settings && settings.host_port !== undefined) {
      setFormSettings({ ...settings });
      if (settings.cloudflare_token && settings.cloudflare_token.trim().length > 0) {
        setTunnelMode('named');
      }
    }
  }, [settings]);

  const isSettingsDirty = Boolean(formSettings && settings && (
    formSettings.host_port !== settings.host_port ||
    formSettings.default_model !== settings.default_model ||
    formSettings.auto_start_hosting !== settings.auto_start_hosting ||
    formSettings.compression_enabled !== settings.compression_enabled ||
    formSettings.api_proxy_enabled !== settings.api_proxy_enabled ||
    formSettings.max_concurrent_requests !== settings.max_concurrent_requests ||
    formSettings.max_payload_bytes !== settings.max_payload_bytes ||
    formSettings.max_context_tokens !== settings.max_context_tokens ||
    formSettings.cloudflare_tunnel_url !== settings.cloudflare_tunnel_url ||
    formSettings.cloudflare_token !== settings.cloudflare_token ||
    formSettings.gemini_api_key !== settings.gemini_api_key ||
    formSettings.groq_api_key !== settings.groq_api_key
  ));

  const handleSaveAllSettings = async () => {
    if (!formSettings) return;
    setIsSavingSettings(true);
    const success = await save(formSettings);
    setIsSavingSettings(false);
    if (success) {
      setSavedFeedback('settings_all');
      setTimeout(() => setSavedFeedback(null), 2500);
    }
  };

  const handleResetSettings = () => {
    if (settings) {
      setFormSettings({ ...settings });
    }
  };

  const getTunnelCommand = () => {
    const port = formSettings?.host_port || settings.host_port || 8384;
    switch (tunnelOs) {
      case 'powershell':
        return `& "$env:LOCALAPPDATA\\com.ghostcompute.app\\cloudflared.exe" tunnel --url http://localhost:${port}`;
      case 'cmd':
        return `"%LOCALAPPDATA%\\com.ghostcompute.app\\cloudflared.exe" tunnel --url http://localhost:${port}`;
      case 'bash':
      default:
        return `~/.local/share/com.ghostcompute.app/cloudflared tunnel --url http://localhost:${port}`;
    }
  };

  useEffect(() => {
    getLocalIp().then(setLocalIp).catch(console.error);
  }, []);

  useEffect(() => {
    if (!isHosting && settings?.auto_start_hosting !== false) {
      startHosting().catch(console.error);
    }
  }, [isHosting, settings?.auto_start_hosting, startHosting]);

  useEffect(() => {
    if (activeNav === 'devices') {
      getPairedDevices().then(setDevices).catch(console.error);
    }
  }, [activeNav]);

  const handleRevoke = async (id: string) => {
    try {
      await revokeDevice(id);
      setDevices(prev => prev.filter(d => d.peer_id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const copyLanAddress = () => {
    const addr = `${localIp}:${settings.host_port || 8384}`;
    navigator.clipboard.writeText(addr);
    setCopiedLan(true);
    setTimeout(() => setCopiedLan(false), 2000);
  };

  return (
    <div className="flex" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Sidebar */}
      <div className="flex flex-col" style={{ width: '240px', background: 'var(--gc-surface)', backdropFilter: 'var(--gc-glass)', WebkitBackdropFilter: 'var(--gc-glass)', borderRight: '1px solid var(--gc-border)', zIndex: 10 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--gc-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-sm">
              <Logo size={24} className="text-accent" />
              <h1 style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.025em' }}>GhostCompute</h1>
            </div>
            <ThemeToggle size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: '10px' }}>
            <Badge variant="info">
              <span className="flex items-center gap-xs">
                <LuWifi size={11} /> LAN Ready
              </span>
            </Badge>
            {settings.cloudflare_token && (
              <Badge variant="success">
                <span className="flex items-center gap-xs">
                  <LuGlobe size={11} /> Tunnel
                </span>
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-xs" style={{ flex: 1, padding: '12px 0' }}>
          {[
            { 
              id: 'sessions', 
              label: 'Sessions', 
              icon: <LuLayers size={16} />
            },
            {
              id: 'catalog',
              label: 'App Store (16 Tools)',
              icon: <LuStore size={16} />
            },
            {
              id: 'users',
              label: 'Access & RBAC',
              icon: <LuShieldCheck size={16} />
            },
            { 
              id: 'devices', 
              label: 'Paired Devices', 
              icon: <LuSmartphone size={16} />
            },
            { 
              id: 'model', 
              label: 'Model Engine', 
              icon: <LuCpu size={16} />
            },
            {
              id: 'integrations',
              label: 'Integrations',
              icon: <LuBox size={16} />
            },
            { 
              id: 'settings', 
              label: 'Settings', 
              icon: <LuSettings size={16} />
            }
          ].map(nav => (
            <button
              key={nav.id}
              className={`nav-item ${activeNav === nav.id ? 'active' : ''}`}
              onClick={() => setActiveNav(nav.id as any)}
            >
              <span style={{ color: activeNav === nav.id ? 'var(--gc-accent)' : 'inherit', display: 'flex', alignItems: 'center' }}>
                {nav.icon}
              </span>
              <span>{nav.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: 'var(--gc-space-lg)', borderTop: '1px solid var(--gc-border)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--gc-space-md)' }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Server Status</span>
            <StatusDot status={isHosting ? 'active' : 'idle'} />
          </div>
          <Button 
            variant={isHosting ? 'danger' : 'primary'} 
            style={{ width: '100%', marginBottom: 'var(--gc-space-sm)' }}
            onClick={isHosting ? stopHosting : startHosting}
          >
            {isHosting ? 'Stop Server' : 'Start Server'}
          </Button>
          <Button
            variant="ghost"
            style={{ width: '100%', fontSize: '12px' }}
            onClick={onResetRole}
            disabled={isHosting}
          >
            Change Role
          </Button>

          {/* Author Credits */}
          <div className="mt-4 pt-3 border-t border-[var(--gc-border)] text-[11px] text-[var(--gc-text-muted)] flex flex-col gap-1">
            <div className="font-medium text-[var(--gc-text)]">GhostCompute 👻 v0.1.0</div>
            <div>Built by <span className="font-semibold text-[var(--gc-text)]">John Varghese (J0X)</span></div>
            <div className="flex items-center gap-2 mt-0.5">
              <a href="https://github.com/John-Varghese-EH" target="_blank" rel="noreferrer" className="text-accent hover:underline">GitHub</a>
              <span>•</span>
              <a href="https://linkedin.com/in/John--Varghese" target="_blank" rel="noreferrer" className="text-accent hover:underline">LinkedIn</a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: 'var(--gc-space-xl)', overflowY: 'auto' }}>
        
        {activeNav === 'sessions' && (
          <div className="flex flex-col gap-md">
            {/* Host Address & Status Banner */}
            <div 
              className="card glass-panel flex justify-between items-center"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--gc-border)',
                padding: 'var(--gc-space-md) var(--gc-space-lg)',
                borderRadius: 'var(--gc-radius-lg)'
              }}
            >
              <div className="flex items-center gap-md">
                <div 
                  className="flex items-center justify-center text-accent"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--gc-radius-md)',
                    background: 'var(--gc-accent-muted)'
                  }}
                >
                  <LuWifi size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-sm">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Host LAN Address</span>
                    <Badge variant="info">Port {settings.host_port || 8384}</Badge>
                  </div>
                  <div className="text-muted text-mono" style={{ fontSize: '13px', marginTop: '2px' }}>
                    {localIp}:{settings.host_port || 8384}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-sm">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={copyLanAddress}
                  className="flex items-center gap-xs"
                >
                  {copiedLan ? <LuCheck size={14} className="text-success" /> : <LuCopy size={14} />}
                  <span>{copiedLan ? 'Copied' : 'Copy LAN IP'}</span>
                </Button>
              </div>
            </div>

            {/* Quick Action Station */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
              <div 
                onClick={() => setActiveNav('catalog')}
                className="card glass-panel cursor-pointer hover:border-violet-500/40 transition-all flex items-center gap-3 p-4 group"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                  <LuStore size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--gc-text)]">App Store Catalog</div>
                  <div className="text-xs text-[var(--gc-text-muted)]">16 AI & Media Tools</div>
                </div>
              </div>

              <div 
                onClick={() => setActiveNav('users')}
                className="card glass-panel cursor-pointer hover:border-emerald-500/40 transition-all flex items-center gap-3 p-4 group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                  <LuShieldCheck size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--gc-text)]">Invite Client Laptop</div>
                  <div className="text-xs text-[var(--gc-text-muted)]">One-Click Encrypted Link</div>
                </div>
              </div>

              <div 
                onClick={() => setActiveNav('integrations')}
                className="card glass-panel cursor-pointer hover:border-blue-500/40 transition-all flex items-center gap-3 p-4 group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                  <LuBox size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--gc-text)]">OpenAI Gateway</div>
                  <div className="text-xs text-[var(--gc-text-muted)]">Cursor & Claude Code</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center" style={{ marginTop: 'var(--gc-space-sm)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Active Sessions</h2>
              <span className="text-muted" style={{ fontSize: '13px' }}>{sessions.length} connected</span>
            </div>

            {sessions.length === 0 ? (
              <EmptyState 
                icon={<LuPlugZap size={24} />} 
                title="No active client sessions" 
                description="Waiting for client laptops to connect. Share your LAN IP or Quick Tunnel address." 
              />
            ) : (
              <div className="flex flex-col gap-sm">
                {sessions.map(session => (
                  <div key={session.peer_id} className="card glass-panel flex justify-between items-center">
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{session.device_name}</div>
                      <div className="text-muted text-mono" style={{ fontSize: '12px' }}>
                        ID: {session.peer_id.substring(0, 8)}...
                      </div>
                      <div className="text-muted" style={{ fontSize: '12px' }}>
                        Connected: {new Date(session.connected_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => killSession(session.peer_id)}>Kill</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeNav === 'catalog' && (
          <AppStoreCatalog />
        )}

        {activeNav === 'users' && (
          <UserManagementPanel />
        )}

        {activeNav === 'devices' && (
          <div className="flex flex-col gap-md">
            <div className="flex justify-between items-center">
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Paired Devices</h2>
              <Button onClick={async () => {
                try {
                  const link = await generatePairingLink();
                  setPairingLink(link);
                } catch(e) {
                  console.error(e);
                }
              }}>Generate Pairing Link</Button>
            </div>
            
            {pairingLink && (
              <div className="card glass-panel flex flex-col gap-sm" style={{ background: 'var(--gc-accent-muted)', borderColor: 'var(--gc-accent)' }}>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Share this secure link with the client:</div>
                <div className="flex gap-sm">
                  <input readOnly value={pairingLink} className="input" style={{ flex: 1, fontFamily: 'monospace' }} />
                  <Button onClick={() => navigator.clipboard.writeText(pairingLink)}>Copy</Button>
                </div>
                <div className="text-muted" style={{ fontSize: '12px' }}>Link expires in 10 minutes.</div>
              </div>
            )}

            {devices.length === 0 ? (
              <EmptyState 
                icon={<LuSmartphone size={24} />} 
                title="No paired devices" 
                description="You haven't paired with any clients yet." 
              />
            ) : (
              <div className="flex flex-col gap-sm">
                {devices.map(device => (
                  <div key={device.peer_id} className="card glass-panel flex justify-between items-center">
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{device.device_name}</div>
                      <div className="text-muted text-mono" style={{ fontSize: '12px' }}>
                        {device.peer_id.substring(0, 8)}...
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(device.peer_id)}>Revoke</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeNav === 'model' && (
          <div className="flex flex-col gap-md">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Model Management</h2>
                <p className="text-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
                  Manage local LLM weights served to clients via Ollama.
                </p>
              </div>
              <Badge variant={ollamaStatus === 'Running' ? 'success' : 'danger'} className="shrink-0">
                {ollamaStatus === 'Running' ? 'Ollama Online' : 'Ollama Offline'}
              </Badge>
            </div>

            {ollamaStatus !== 'Running' && (
              <div className="card glass-panel flex flex-col gap-sm" style={{ border: '1px solid rgba(255, 69, 58, 0.3)', background: 'rgba(255, 69, 58, 0.05)' }}>
                <div className="flex items-center gap-xs text-danger" style={{ fontWeight: 600, fontSize: '14px' }}>
                  <LuInfo size={16} />
                  <span>Ollama is not running on this machine</span>
                </div>
                <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5 }}>
                  GhostCompute Host relays requests to your local Ollama engine. Run the command below in your terminal to start Ollama:
                </p>
                <div className="flex items-center gap-sm" style={{ background: 'var(--gc-bg)', padding: '8px 12px', borderRadius: 'var(--gc-radius-md)', border: '1px solid var(--gc-border)' }}>
                  <code className="text-mono" style={{ fontSize: '12px', flex: 1 }}>
                    ollama serve
                  </code>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      navigator.clipboard.writeText('ollama serve');
                      setSavedFeedback('serve_cmd');
                      setTimeout(() => setSavedFeedback(null), 2000);
                    }}
                    className="flex items-center gap-xs"
                  >
                    {savedFeedback === 'serve_cmd' ? <LuCheck size={12} className="text-success" /> : <LuCopy size={12} />}
                    <span>{savedFeedback === 'serve_cmd' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </div>
            )}

            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--gc-space-md)' }}>Installed Models</h3>
              {models.length === 0 ? (
                <div className="flex flex-col gap-md">
                  <EmptyState 
                    icon={<LuCpu size={24} />} 
                    title="No models installed" 
                    description="No LLM models found in your local Ollama instance." 
                  />
                  <div>
                    <span className="text-muted" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Recommended Quick Installs:
                    </span>
                    <div className="flex flex-wrap gap-sm" style={{ marginTop: '8px' }}>
                      {[
                        { name: 'llama3.2:1b', desc: '1.3 GB • Ultra-fast' },
                        { name: 'llama3.2:3b', desc: '2.0 GB • High quality' },
                        { name: 'qwen2.5:1.5b', desc: '1.0 GB • Code & reasoning' },
                        { name: 'deepseek-r1:1.5b', desc: '1.1 GB • Reasoning engine' }
                      ].map(rec => (
                        <div 
                          key={rec.name}
                          className="flex items-center justify-between gap-md"
                          style={{ 
                            background: 'var(--gc-bg)', 
                            border: '1px solid var(--gc-border)', 
                            padding: '8px 12px', 
                            borderRadius: 'var(--gc-radius-md)',
                            flex: '1 1 200px'
                          }}
                        >
                          <div>
                            <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{rec.name}</div>
                            <div className="text-muted" style={{ fontSize: '11px' }}>{rec.desc}</div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => pullModel(rec.name)} className="flex items-center gap-xs">
                            <LuDownload size={12} />
                            <span>Pull</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-sm">
                  {models.map(m => (
                    <div key={m.name} className="flex justify-between items-center" style={{ padding: 'var(--gc-space-sm) var(--gc-space-md)', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-md)' }}>
                      <div>
                        <div className="text-mono" style={{ fontSize: '14px', fontWeight: 600 }}>{m.name}</div>
                        <div className="text-muted" style={{ fontSize: '12px' }}>{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => swapModel(m.name)}>Set Active</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--gc-space-xs)' }}>Pull Custom Model</h3>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: 'var(--gc-space-md)' }}>
                Download any model tag from the Ollama library (e.g. <code className="text-mono">mistral</code>, <code className="text-mono">gemma2</code>, <code className="text-mono">phi3</code>).
              </p>
              <div className="flex gap-sm" style={{ maxWidth: '420px' }}>
                <input type="text" id="pull-model-input" className="input" placeholder="e.g. llama3.2:1b" />
                <Button 
                  onClick={() => {
                    const el = document.getElementById('pull-model-input') as HTMLInputElement;
                    if (el && el.value.trim()) {
                      pullModel(el.value.trim());
                      el.value = '';
                    }
                  }}
                  className="flex items-center gap-xs"
                >
                  <LuDownload size={14} />
                  <span>Pull</span>
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {activeNav === 'integrations' && (
          <IntegrationsPanel />
        )}

        {activeNav === 'settings' && (() => {
          const cur = formSettings || settings || ({} as AppSettings);
          const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
            setFormSettings(prev => ({
              ...(prev || settings),
              [key]: value
            }));
          };

          return (
            <div className="flex flex-col gap-xl pb-16" style={{ maxWidth: '960px', margin: '0 auto' }}>
              
              {/* Top Header & Sticky Save Status Bar */}
              <div className="flex flex-wrap justify-between items-center gap-md pb-4 border-b border-[var(--gc-border)]">
                <div>
                  <div className="flex items-center gap-sm">
                    <h2 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.02em' }}>Host Configuration</h2>
                    <Badge variant="info">Settings</Badge>
                  </div>
                  <p className="text-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
                    Tune daemon networking, zero-trust tunnel routing, GPU limits, and cloud fallbacks.
                  </p>
                </div>

                <div className="flex items-center gap-sm">
                  {isSettingsDirty && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleResetSettings}
                      disabled={isSavingSettings}
                      className="flex items-center gap-xs text-muted hover:text-white"
                    >
                      <LuRotateCcw size={13} />
                      <span>Discard Changes</span>
                    </Button>
                  )}
                  <Button 
                    variant="primary"
                    onClick={handleSaveAllSettings}
                    disabled={isSavingSettings || !isSettingsDirty}
                    className="flex items-center gap-xs"
                    style={{
                      opacity: isSettingsDirty ? 1 : 0.6,
                      boxShadow: isSettingsDirty ? '0 0 20px rgba(139, 92, 246, 0.4)' : 'none'
                    }}
                  >
                    {isSavingSettings ? (
                      <>
                        <span className="spinner" />
                        <span>Saving...</span>
                      </>
                    ) : savedFeedback === 'settings_all' ? (
                      <>
                        <LuCheck size={14} className="text-success" />
                        <span>Configuration Saved</span>
                      </>
                    ) : (
                      <>
                        <LuSave size={14} />
                        <span>{isSettingsDirty ? 'Save Changes' : 'Saved'}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* 1. Host Daemon & Network Engine */}
              <div className="card glass-panel flex flex-col gap-md" style={{ padding: '22px' }}>
                <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-[var(--gc-border)]">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-accent shrink-0">
                      <LuSlidersHorizontal size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Host Daemon & Local Network</h3>
                      <p className="text-muted text-[12px]">Local binding port and serving defaults</p>
                    </div>
                  </div>
                  <Badge variant="neutral" className="shrink-0">Core Daemon</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg pt-1">
                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Host Listen Port
                    </label>
                    <input 
                      type="number" 
                      className="input" 
                      value={cur.host_port ?? 8384} 
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        updateField('host_port', isNaN(val) ? 8384 : val);
                      }} 
                    />
                    <div className="flex items-center gap-xs mt-1 text-[11px] text-[var(--gc-text-muted)]">
                      <span>LAN Address:</span>
                      <code className="text-mono text-[var(--gc-text)] bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] px-1.5 py-0.5 rounded">
                        http://{localIp}:{cur.host_port ?? 8384}
                      </code>
                    </div>
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Default Serving Model
                    </label>
                    <CustomSelect
                      value={cur.default_model || ''}
                      onChange={val => updateField('default_model', val || null)}
                      placeholder="Auto-select (First available)"
                      options={[
                        { value: '', label: 'Auto-select (First available)', description: 'Automatically serves the first loaded model in Ollama' },
                        ...models.map(m => ({
                          value: m.name,
                          label: m.name,
                          description: `${(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB • VRAM Ready`
                        }))
                      ]}
                    />
                    <span className="text-muted text-[11px] mt-1">Default model served to incoming client sessions</span>
                  </div>
                </div>

                {/* Tactile Toggle Switches */}
                <div className="flex flex-col gap-sm pt-3 border-t border-[var(--gc-border)]">
                  
                  {/* Switch 1: Auto-start */}
                  <div 
                    onClick={() => updateField('auto_start_hosting', !cur.auto_start_hosting)}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-border)] border border-[var(--gc-border)] cursor-pointer transition-colors"
                  >
                    <div className="pr-4">
                      <div className="text-[13px] font-medium text-[var(--gc-text)]">Auto-start Host Server on Launch</div>
                      <div className="text-[11px] text-[var(--gc-text-muted)] mt-0.5">
                        Automatically spins up the compute daemon and begins listening for client pairing when GhostCompute starts
                      </div>
                    </div>
                    <div className={`toggle-switch ${cur.auto_start_hosting ? 'active' : ''}`}>
                      <div className="toggle-switch-thumb" />
                    </div>
                  </div>

                  {/* Switch 2: Compression */}
                  <div 
                    onClick={() => updateField('compression_enabled', !cur.compression_enabled)}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-border)] border border-[var(--gc-border)] cursor-pointer transition-colors"
                  >
                    <div className="pr-4">
                      <div className="text-[13px] font-medium text-[var(--gc-text)]">Hardware Payload Compression (LZ4 / zstd)</div>
                      <div className="text-[11px] text-[var(--gc-text-muted)] mt-0.5">
                        Compresses token streams and network payloads to save up to 60% bandwidth on remote client connections
                      </div>
                    </div>
                    <div className={`toggle-switch ${cur.compression_enabled ? 'active' : ''}`}>
                      <div className="toggle-switch-thumb" />
                    </div>
                  </div>

                  {/* Switch 3: API Proxy */}
                  <div 
                    onClick={() => updateField('api_proxy_enabled', !cur.api_proxy_enabled)}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-border)] border border-[var(--gc-border)] cursor-pointer transition-colors"
                  >
                    <div className="pr-4">
                      <div className="text-[13px] font-medium text-[var(--gc-text)]">Local OpenAI Compatibility Gateway</div>
                      <div className="text-[11px] text-[var(--gc-text-muted)] mt-0.5">
                        Enables localhost:11434/8384 API translation for Cursor, Claude Code CLI, and Continue extension
                      </div>
                    </div>
                    <div className={`toggle-switch ${cur.api_proxy_enabled ? 'active' : ''}`}>
                      <div className="toggle-switch-thumb" />
                    </div>
                  </div>

                </div>
              </div>

              {/* 2. Zero-Trust Tunneling Gateway */}
              <div className="card glass-panel flex flex-col gap-md" style={{ padding: '22px' }}>
                <div className="flex flex-wrap justify-between items-center gap-sm pb-3 border-b border-[var(--gc-border)]">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <LuGlobe size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Cloudflare Zero-Trust Tunneling</h3>
                      <p className="text-muted text-[12px]">Encrypted global ingress without port forwarding</p>
                    </div>
                  </div>

                  {/* Segmented Mode Selector */}
                  <div className="segmented-control">
                    <button
                      type="button"
                      onClick={() => setTunnelMode('quick')}
                      className={`segmented-item ${tunnelMode === 'quick' ? 'active' : ''}`}
                    >
                      Free Quick Tunnel
                    </button>
                    <button
                      type="button"
                      onClick={() => setTunnelMode('named')}
                      className={`segmented-item ${tunnelMode === 'named' ? 'active' : ''}`}
                    >
                      Named Zero Trust Tunnel
                    </button>
                  </div>
                </div>

                {tunnelMode === 'quick' ? (
                  <div className="flex flex-col gap-md pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-muted text-[13px] leading-relaxed">
                        Expose your Host server over an ephemeral, end-to-end encrypted Cloudflare tunnel (<code className="text-mono">trycloudflare.com</code>) with zero account configuration.
                      </p>
                      <Badge variant="success" className="self-start sm:self-auto shrink-0">Free • Instant</Badge>
                    </div>

                    {/* OS & Shell Selector */}
                    <div className="flex items-center gap-xs">
                      <span className="text-muted text-[12px] mr-2">Terminal Shell:</span>
                      <div className="segmented-control">
                        <button
                          type="button"
                          onClick={() => setTunnelOs('powershell')}
                          className={`segmented-item ${tunnelOs === 'powershell' ? 'active' : ''}`}
                        >
                          PowerShell
                        </button>
                        <button
                          type="button"
                          onClick={() => setTunnelOs('cmd')}
                          className={`segmented-item ${tunnelOs === 'cmd' ? 'active' : ''}`}
                        >
                          CMD
                        </button>
                        <button
                          type="button"
                          onClick={() => setTunnelOs('bash')}
                          className={`segmented-item ${tunnelOs === 'bash' ? 'active' : ''}`}
                        >
                          Bash / Zsh
                        </button>
                      </div>
                    </div>

                    {/* Command Box */}
                    <div className="flex items-center gap-sm bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] rounded-xl p-3">
                      <code className="text-mono text-[var(--gc-text)] text-[12px] flex-1 break-all">
                        {getTunnelCommand()}
                      </code>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                          navigator.clipboard.writeText(getTunnelCommand());
                          setSavedFeedback('cmd_copy');
                          setTimeout(() => setSavedFeedback(null), 2000);
                        }}
                        className="flex items-center gap-xs shrink-0"
                      >
                        {savedFeedback === 'cmd_copy' ? <LuCheck size={12} className="text-success" /> : <LuCopy size={12} />}
                        <span>{savedFeedback === 'cmd_copy' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    </div>

                    {/* URL Input */}
                    <div className="flex flex-col gap-xs">
                      <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                        Active Quick Tunnel URL
                      </label>
                      <div className="flex gap-sm">
                        <input 
                          type="text" 
                          className="input flex-1" 
                          placeholder="https://whispering-alpha-sample.trycloudflare.com" 
                          value={cur.cloudflare_tunnel_url || ''}
                          onChange={(e) => updateField('cloudflare_tunnel_url', e.target.value || null)}
                        />
                        {cur.cloudflare_tunnel_url && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => window.open(cur.cloudflare_tunnel_url!, '_blank')}
                            className="flex items-center gap-xs"
                            title="Open URL in browser"
                          >
                            <LuExternalLink size={13} />
                            <span>Visit</span>
                          </Button>
                        )}
                      </div>
                      <span className="text-muted text-[11px] mt-0.5">
                        Paste the trycloudflare.com URL generated by your terminal command above
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-md pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-muted text-[13px] leading-relaxed">
                        Connect your host gaming rig directly to your custom domain via Cloudflare Zero Trust tunnel token.
                      </p>
                      <Badge variant="info" className="self-start sm:self-auto shrink-0">Persistent • Custom Domain</Badge>
                    </div>

                    <div className="flex flex-col gap-xs">
                      <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                        Cloudflare Tunnel Token
                      </label>
                      <div className="flex gap-sm">
                        <div className="relative flex-1">
                          <input 
                            type={showToken ? "text" : "password"} 
                            className="input w-full pr-10" 
                            placeholder="eyJh..." 
                            value={cur.cloudflare_token || ''}
                            onChange={(e) => updateField('cloudflare_token', e.target.value || null)}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                          >
                            {showToken ? <LuEyeOff size={14} /> : <LuEye size={14} />}
                          </button>
                        </div>
                      </div>
                      <span className="text-muted text-[11px] mt-0.5">
                        Obtained from Cloudflare Zero Trust Dashboard &gt; Networks &gt; Tunnels &gt; Install Connector
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Resource Guardrails & Concurrency Limits */}
              <div className="card glass-panel flex flex-col gap-md" style={{ padding: '22px' }}>
                <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-[var(--gc-border)]">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <LuCpu size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Resource Guardrails & Concurrency</h3>
                      <p className="text-muted text-[12px]">VRAM protection and client traffic throttling</p>
                    </div>
                  </div>
                  <Badge variant="success" className="shrink-0">VRAM Guard</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-md pt-1">
                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Max Concurrent Requests
                    </label>
                    <input 
                      type="number" 
                      className="input" 
                      value={cur.max_concurrent_requests ?? 10} 
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        updateField('max_concurrent_requests', isNaN(val) ? 10 : val);
                      }} 
                    />
                    <span className="text-muted text-[11px] mt-0.5">Max simultaneous client requests</span>
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Max Payload Size (MB)
                    </label>
                    <input 
                      type="number" 
                      className="input" 
                      value={Math.round((cur.max_payload_bytes ?? 104857600) / (1024 * 1024))} 
                      onChange={e => {
                        const mb = parseInt(e.target.value);
                        updateField('max_payload_bytes', isNaN(mb) ? 104857600 : mb * 1024 * 1024);
                      }} 
                    />
                    <span className="text-muted text-[11px] mt-0.5">Prevents payload buffer overflows</span>
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Max Context Tokens
                    </label>
                    <input 
                      type="number" 
                      className="input" 
                      value={cur.max_context_tokens ?? 8192} 
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        updateField('max_context_tokens', isNaN(val) ? 8192 : val);
                      }} 
                    />
                    <span className="text-muted text-[11px] mt-0.5">Per-request KV cache bound</span>
                  </div>
                </div>
              </div>

              {/* 4. Cloud AI Gateways (External Fallbacks) */}
              <div className="card glass-panel flex flex-col gap-md" style={{ padding: '22px' }}>
                <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-[var(--gc-border)]">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <LuPlugZap size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Cloud AI Gateways</h3>
                      <p className="text-muted text-[12px]">Optional cloud provider keys for hybrid fallback routing</p>
                    </div>
                  </div>
                  <Badge variant="warning" className="shrink-0">Optional</Badge>
                </div>

                <p className="text-muted text-[13px]">
                  Provide external API keys so connected client laptops can route queries through GhostCompute to cloud models (Google Gemini or Groq) when your local GPU VRAM is saturated.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg pt-1">
                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Google Gemini API Key
                    </label>
                    <div className="relative">
                      <input 
                        type={showGeminiKey ? "text" : "password"} 
                        className="input w-full pr-10" 
                        placeholder="AIzaSy..." 
                        value={cur.gemini_api_key || ''}
                        onChange={(e) => updateField('gemini_api_key', e.target.value || null)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                      >
                        {showGeminiKey ? <LuEyeOff size={14} /> : <LuEye size={14} />}
                      </button>
                    </div>
                    <span className="text-muted text-[11px] mt-0.5">Access gemini-2.5-flash and gemini-1.5-pro models</span>
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-muted">
                      Groq API Key
                    </label>
                    <div className="relative">
                      <input 
                        type={showGroqKey ? "text" : "password"} 
                        className="input w-full pr-10" 
                        placeholder="gsk_..." 
                        value={cur.groq_api_key || ''}
                        onChange={(e) => updateField('groq_api_key', e.target.value || null)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroqKey(!showGroqKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                      >
                        {showGroqKey ? <LuEyeOff size={14} /> : <LuEye size={14} />}
                      </button>
                    </div>
                    <span className="text-muted text-[11px] mt-0.5">Ultra-low-latency LPU cloud inference endpoint</span>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}
      </div>
    </div>
  );
};
