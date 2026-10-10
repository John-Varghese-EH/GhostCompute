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
  LuInfo
} from 'react-icons/lu';
import { useHosting } from '../hooks/useHosting';
import { useOllama } from '../hooks/useOllama';
import { useSettings } from '../hooks/useSettings';
import { getPairedDevices, revokeDevice, TrustedPeer, generatePairingLink, getLocalIp } from '../lib/tauri';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { StatusDot } from './common/StatusDot';
import { EmptyState } from './common/EmptyState';
import { Logo } from './common/Logo';
import { IntegrationsPanel } from './IntegrationsPanel';

interface HostConsoleProps {
  onResetRole: () => void;
}

export const HostConsole: React.FC<HostConsoleProps> = ({ onResetRole }) => {
  const [activeNav, setActiveNav] = useState<'sessions' | 'devices' | 'model' | 'integrations' | 'settings'>('sessions');
  const { isHosting, sessions, startHosting, stopHosting, killSession } = useHosting();
  const { status: ollamaStatus, models, pullModel, swapModel } = useOllama();
  const { settings, save } = useSettings();
  const [tokenInput, setTokenInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [groqInput, setGroqInput] = useState('');
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

  const getTunnelCommand = () => {
    const port = settings.host_port || 8384;
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

  const handleSaveWithFeedback = async (section: string, newSettings: any) => {
    await save(newSettings);
    setSavedFeedback(section);
    setTimeout(() => setSavedFeedback(null), 2500);
  };

  useEffect(() => {
    getLocalIp().then(setLocalIp).catch(console.error);
  }, []);

  useEffect(() => {
    if (settings.cloudflare_token) {
      setTokenInput(settings.cloudflare_token);
    }
    if (settings.cloudflare_tunnel_url) {
      setUrlInput(settings.cloudflare_tunnel_url);
    }
    if (settings.gemini_api_key) {
      setGeminiInput(settings.gemini_api_key);
    }
    if (settings.groq_api_key) {
      setGroqInput(settings.groq_api_key);
    }
  }, [settings]);

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
      <div className="flex flex-col" style={{ width: '240px', background: 'rgba(15, 15, 18, 0.85)', backdropFilter: 'var(--gc-glass)', WebkitBackdropFilter: 'var(--gc-glass)', borderRight: '1px solid var(--gc-border)', zIndex: 10 }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--gc-border)' }}>
          <div className="flex items-center gap-sm">
            <Logo size={24} className="text-accent" />
            <h1 style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.025em' }}>GhostCompute</h1>
          </div>
          <div className="flex items-center gap-xs" style={{ marginTop: '10px' }}>
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
            <div className="flex justify-between items-center">
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Model Management</h2>
                <p className="text-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
                  Manage local LLM weights served to clients via Ollama.
                </p>
              </div>
              <Badge variant={ollamaStatus === 'Running' ? 'success' : 'danger'}>
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

        {activeNav === 'settings' && (
          <div className="flex flex-col gap-md">
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Server Settings</h2>
            
            <div className="card glass-panel flex flex-col gap-md">
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>General Host Settings</h3>
              
              <div className="flex gap-lg">
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>Host Port</label>
                  <input type="number" className="input" value={settings.host_port || ''} onChange={e => save({...settings, host_port: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>Default Model</label>
                  <select className="input" value={settings.default_model || ''} onChange={e => save({...settings, default_model: e.target.value})}>
                    <option value="">None</option>
                    {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-lg">
                <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '13px', flex: 1 }}>
                  <input type="checkbox" checked={settings.auto_start_hosting || false} onChange={e => save({...settings, auto_start_hosting: e.target.checked})} />
                  Auto-start hosting on app launch
                </label>
                <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '13px', flex: 1 }}>
                  <input type="checkbox" checked={settings.compression_enabled || false} onChange={e => save({...settings, compression_enabled: e.target.checked})} />
                  Enable payload compression
                </label>
              </div>
            </div>

            <div className="card glass-panel flex flex-col gap-md">
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Limits & Tuning</h3>
              
              <div className="flex gap-lg">
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>Max Concurrent Requests</label>
                  <input type="number" className="input" value={settings.max_concurrent_requests || ''} onChange={e => save({...settings, max_concurrent_requests: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>Max Payload Bytes</label>
                  <input type="number" className="input" value={settings.max_payload_bytes || ''} onChange={e => save({...settings, max_payload_bytes: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>Max Context Tokens</label>
                  <input type="number" className="input" value={settings.max_context_tokens || ''} onChange={e => save({...settings, max_context_tokens: parseInt(e.target.value) || 0})} />
                </div>
              </div>
            </div>

            {/* Cloudflare Quick Tunnel (Free, No Credit Card) */}
            <div className="card glass-panel" style={{ border: '1px solid rgba(10, 132, 255, 0.3)' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: 'var(--gc-space-xs)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                  Cloudflare Quick Tunnel (Free • No Credit Card Required)
                </h3>
                <Badge variant="info">Recommended</Badge>
              </div>
              <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5, marginBottom: 'var(--gc-space-sm)' }}>
                Expose your Host server to remote clients over the internet instantly with zero account setup. Select your operating system and copy the command to run in your terminal:
              </p>

              {/* OS & Shell Selector Pills */}
              <div className="segmented-control" style={{ width: 'fit-content', marginBottom: 'var(--gc-space-sm)' }}>
                <button
                  type="button"
                  onClick={() => setTunnelOs('powershell')}
                  className={`segmented-item ${tunnelOs === 'powershell' ? 'active' : ''}`}
                >
                  Windows (PowerShell)
                </button>
                <button
                  type="button"
                  onClick={() => setTunnelOs('cmd')}
                  className={`segmented-item ${tunnelOs === 'cmd' ? 'active' : ''}`}
                >
                  Windows (CMD)
                </button>
                <button
                  type="button"
                  onClick={() => setTunnelOs('bash')}
                  className={`segmented-item ${tunnelOs === 'bash' ? 'active' : ''}`}
                >
                  macOS / Linux (Bash)
                </button>
              </div>
              
              <div className="flex items-center gap-sm" style={{ background: 'var(--gc-bg)', padding: '10px 14px', borderRadius: 'var(--gc-radius-md)', border: '1px solid var(--gc-border)', marginBottom: 'var(--gc-space-md)' }}>
                <code className="text-mono" style={{ fontSize: '12px', flex: 1, wordBreak: 'break-all' }}>
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
                  className="flex items-center gap-xs"
                >
                  {savedFeedback === 'cmd_copy' ? <LuCheck size={12} className="text-success" /> : <LuCopy size={12} />}
                  <span>{savedFeedback === 'cmd_copy' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>

              <div className="flex flex-col gap-sm" style={{ maxWidth: '480px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Paste Generated Tunnel URL (from trycloudflare.com)</label>
                <div className="flex gap-sm">
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="https://random-words.trycloudflare.com" 
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{ flex: 1, fontSize: '13px' }}
                  />
                  <Button 
                    onClick={() => handleSaveWithFeedback('tunnel_quick', {
                      ...settings,
                      cloudflare_tunnel_url: urlInput
                    })}
                    className="flex items-center gap-xs"
                  >
                    {savedFeedback === 'tunnel_quick' ? <LuCheck size={14} /> : null}
                    <span>{savedFeedback === 'tunnel_quick' ? 'Saved' : 'Save URL'}</span>
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Named Zero Trust Tunnel (Advanced) */}
            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--gc-space-xs)' }}>
                Named Cloudflare Tunnel (Zero Trust)
              </h3>
              <p className="text-muted" style={{ marginBottom: 'var(--gc-space-sm)', fontSize: '13px' }}>
                If you have a Cloudflare Zero Trust account with a custom domain, you can provide your persistent tunnel token below:
              </p>
              
              <div className="flex flex-col gap-sm" style={{ maxWidth: '400px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Tunnel Token</label>
                <div className="flex gap-sm">
                  <input 
                    type="password" 
                    className="input" 
                    placeholder="eyJh..." 
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <Button 
                  style={{ marginTop: 'var(--gc-space-sm)' }}
                  onClick={() => handleSaveWithFeedback('tunnel_token', { 
                    ...settings, 
                    cloudflare_token: tokenInput, 
                    cloudflare_tunnel_url: urlInput,
                    gemini_api_key: geminiInput,
                    groq_api_key: groqInput
                  })}
                  className="flex items-center gap-xs"
                >
                  {savedFeedback === 'tunnel_token' ? <LuCheck size={14} /> : null}
                  <span>{savedFeedback === 'tunnel_token' ? 'Saved' : 'Save Token'}</span>
                </Button>
              </div>
            </div>

            {/* Cloud AI Gateways */}
            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--gc-space-xs)' }}>
                Cloud AI Gateways
              </h3>
              <p className="text-muted" style={{ marginBottom: 'var(--gc-space-md)', fontSize: '13px' }}>
                Optionally provide API keys for external models (Gemini, Groq) so connected clients can securely access cloud models via GhostCompute proxy.
              </p>
              
              <div className="flex flex-col gap-sm" style={{ maxWidth: '400px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Google Gemini API Key</label>
                <input 
                  type="password" 
                  className="input" 
                  placeholder="AIzaSy..." 
                  value={geminiInput}
                  onChange={(e) => setGeminiInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <label style={{ fontSize: '13px', fontWeight: 500, marginTop: 'var(--gc-space-sm)' }}>Groq API Key</label>
                <input 
                  type="password" 
                  className="input" 
                  placeholder="gsk_..." 
                  value={groqInput}
                  onChange={(e) => setGroqInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button 
                  style={{ marginTop: 'var(--gc-space-sm)' }}
                  onClick={() => handleSaveWithFeedback('api_keys', { 
                    ...settings, 
                    cloudflare_token: tokenInput, 
                    cloudflare_tunnel_url: urlInput,
                    gemini_api_key: geminiInput,
                    groq_api_key: groqInput
                  })}
                  className="flex items-center gap-xs"
                >
                  {savedFeedback === 'api_keys' ? <LuCheck size={14} /> : null}
                  <span>{savedFeedback === 'api_keys' ? 'Saved' : 'Save API Keys'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
