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
  LuGlobe
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
      <div className="flex flex-col glass-panel" style={{ width: '250px', borderRight: 'none', borderRadius: 0, zIndex: 10 }}>
        <div style={{ padding: 'var(--gc-space-lg)', borderBottom: '1px solid var(--gc-border)' }}>
          <div className="flex items-center gap-sm">
            <Logo size={28} className="text-accent" />
            <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.5px' }}>GhostCompute</h1>
          </div>
          <div className="flex items-center gap-sm" style={{ marginTop: 'var(--gc-space-sm)' }}>
            <Badge variant="info">
              <span className="flex items-center gap-xs">
                <LuWifi size={12} /> LAN Ready
              </span>
            </Badge>
            {settings.cloudflare_token && (
              <Badge variant="success">
                <span className="flex items-center gap-xs">
                  <LuGlobe size={12} /> Tunnel
                </span>
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col" style={{ flex: 1, padding: 'var(--gc-space-md) 0' }}>
          {[
            { 
              id: 'sessions', 
              label: 'Sessions', 
              icon: <LuLayers size={18} />
            },
            { 
              id: 'devices', 
              label: 'Paired Devices', 
              icon: <LuSmartphone size={18} />
            },
            { 
              id: 'model', 
              label: 'Model Engine', 
              icon: <LuCpu size={18} />
            },
            {
              id: 'integrations',
              label: 'Integrations',
              icon: <LuBox size={18} />
            },
            { 
              id: 'settings', 
              label: 'Settings', 
              icon: <LuSettings size={18} />
            }
          ].map(nav => (
            <button
              key={nav.id}
              className="text-left flex items-center gap-md"
              style={{
                padding: 'var(--gc-space-md) var(--gc-space-lg)',
                background: activeNav === nav.id ? 'var(--gc-bg)' : 'transparent',
                border: 'none',
                color: activeNav === nav.id ? 'var(--gc-text)' : 'var(--gc-text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--gc-font-ui)',
                fontSize: '14px',
                fontWeight: activeNav === nav.id ? 500 : 400,
                borderRight: activeNav === nav.id ? '2px solid var(--gc-accent)' : '2px solid transparent',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setActiveNav(nav.id as any)}
            >
              <span style={{ opacity: activeNav === nav.id ? 1 : 0.7 }}>{nav.icon}</span>
              {nav.label}
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
              <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Model Management</h2>
              <Badge variant={ollamaStatus === 'Running' ? 'success' : 'danger'}>{ollamaStatus}</Badge>
            </div>
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: 'var(--gc-space-md)' }}>Current Models</h3>
              <div className="flex flex-col gap-sm">
                {models.map(m => (
                  <div key={m.name} className="flex justify-between items-center" style={{ padding: 'var(--gc-space-sm)', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-md)' }}>
                    <div>
                      <div className="text-mono" style={{ fontSize: '14px' }}>{m.name}</div>
                      <div className="text-muted" style={{ fontSize: '12px' }}>{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => swapModel(m.name)}>Set Active</Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: 'var(--gc-space-md)' }}>Pull Model</h3>
              <div className="flex gap-sm">
                <input type="text" id="pull-model-input" className="input" placeholder="e.g. llama3" />
                <Button onClick={() => {
                  const val = (document.getElementById('pull-model-input') as HTMLInputElement).value;
                  if (val) pullModel(val);
                }}>Pull</Button>
              </div>
            </div>
          </div>
        )}
        
        {activeNav === 'integrations' && (
          <IntegrationsPanel />
        )}

        {activeNav === 'settings' && (
          <div className="flex flex-col gap-md">
            <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Settings</h2>
            
            <div className="card flex flex-col gap-md">
              <h3 style={{ fontSize: '16px', fontWeight: 500 }}>General Server Settings</h3>
              
              <div className="flex gap-lg">
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Host Port</label>
                  <input type="number" className="input" value={settings.host_port || ''} onChange={e => save({...settings, host_port: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Default Model</label>
                  <select className="input" value={settings.default_model || ''} onChange={e => save({...settings, default_model: e.target.value})}>
                    <option value="">None</option>
                    {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-lg">
                <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '14px', flex: 1 }}>
                  <input type="checkbox" checked={settings.auto_start_hosting || false} onChange={e => save({...settings, auto_start_hosting: e.target.checked})} />
                  Auto-start hosting on app launch
                </label>
                <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '14px', flex: 1 }}>
                  <input type="checkbox" checked={settings.compression_enabled || false} onChange={e => save({...settings, compression_enabled: e.target.checked})} />
                  Enable payload compression
                </label>
              </div>
            </div>

            <div className="card flex flex-col gap-md">
              <h3 style={{ fontSize: '16px', fontWeight: 500 }}>Limits & Tuning</h3>
              
              <div className="flex gap-lg">
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Max Concurrent Requests</label>
                  <input type="number" className="input" value={settings.max_concurrent_requests || ''} onChange={e => save({...settings, max_concurrent_requests: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Max Payload Bytes</label>
                  <input type="number" className="input" value={settings.max_payload_bytes || ''} onChange={e => save({...settings, max_payload_bytes: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col gap-xs" style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Max Context Tokens</label>
                  <input type="number" className="input" value={settings.max_context_tokens || ''} onChange={e => save({...settings, max_context_tokens: parseInt(e.target.value) || 0})} />
                </div>
              </div>
            </div>

            <div className="card flex flex-col gap-md">
              <h3 style={{ fontSize: '16px', fontWeight: 500 }}>Privacy & Security</h3>
              <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '14px' }}>
                <input type="checkbox" checked={settings.strip_credentials || false} onChange={e => save({...settings, strip_credentials: e.target.checked})} />
                Strip client credentials from internal logs
              </label>
            </div>
            
            <div className="card glass-panel">
              <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: 'var(--gc-space-xs)' }}>
                Cloudflare Tunnel Integration
              </h3>
              <p className="text-muted" style={{ marginBottom: 'var(--gc-space-sm)', fontSize: '14px' }}>
                If you want to expose your host over the internet when local network mDNS discovery is not available, provide a Cloudflare Tunnel token. The server will automatically spawn <code className="text-mono" style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>cloudflared</code> when hosting starts.
              </p>
              
              <div className="text-muted" style={{ fontSize: '13px', marginBottom: 'var(--gc-space-lg)', background: 'rgba(255,255,255,0.05)', padding: 'var(--gc-space-md)', borderRadius: 'var(--gc-radius-md)' }}>
                <strong>How to setup Cloudflare Tunnel:</strong>
                <ol style={{ marginLeft: '16px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>Go to <a href="https://one.dash.cloudflare.com" target="_blank" style={{ color: 'var(--gc-accent)' }}>Cloudflare Zero Trust Dashboard</a></li>
                  <li>Navigate to <strong>Networks &gt; Tunnels</strong> and click <strong>Create a tunnel</strong></li>
                  <li>Choose <strong>Cloudflared</strong> and name your tunnel.</li>
                  <li>Copy the token provided in the installation script (the long string after <code style={{background:'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px'}}>--token</code>)</li>
                  <li>In the <strong>Public Hostname</strong> tab, add a hostname (e.g. <code>ghost.yourdomain.com</code>) and set the service to <code>http://127.0.0.1:[Host Port]</code></li>
                </ol>
              </div>
              
              <div className="flex flex-col gap-sm" style={{ maxWidth: '400px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500 }}>Tunnel Token</label>
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
                <label style={{ fontSize: '14px', fontWeight: 500, marginTop: 'var(--gc-space-sm)' }}>Public Hostname URL</label>
                <div className="flex gap-sm">
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="https://ghost.yourdomain.com" 
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <Button 
                  style={{ marginTop: 'var(--gc-space-sm)' }}
                  onClick={() => save({ 
                    ...settings, 
                    cloudflare_token: tokenInput, 
                    cloudflare_tunnel_url: urlInput,
                    gemini_api_key: geminiInput,
                    groq_api_key: groqInput
                  })}
                >
                  Save Tunnel Configuration
                </Button>
              </div>
            </div>

            <div className="card glass-panel" style={{ marginTop: 'var(--gc-space-md)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: 'var(--gc-space-xs)' }}>
                Cloud AI Gateways
              </h3>
              <p className="text-muted" style={{ marginBottom: 'var(--gc-space-lg)', fontSize: '14px' }}>
                GhostCompute acts as a unified AI gateway. You can provide your API keys for external models (like Gemini and Groq) here, allowing any connected client device to securely utilize them through the exact same GhostCompute proxy endpoint.
              </p>
              
              <div className="flex flex-col gap-sm" style={{ maxWidth: '400px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500 }}>Google Gemini API Key</label>
                <div className="flex gap-sm">
                  <input 
                    type="password" 
                    className="input" 
                    placeholder="AIzaSy..." 
                    value={geminiInput}
                    onChange={(e) => setGeminiInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <label style={{ fontSize: '14px', fontWeight: 500, marginTop: 'var(--gc-space-sm)' }}>Groq API Key</label>
                <div className="flex gap-sm">
                  <input 
                    type="password" 
                    className="input" 
                    placeholder="gsk_..." 
                    value={groqInput}
                    onChange={(e) => setGroqInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <Button 
                  style={{ marginTop: 'var(--gc-space-sm)' }}
                  onClick={() => save({ 
                    ...settings, 
                    cloudflare_token: tokenInput, 
                    cloudflare_tunnel_url: urlInput,
                    gemini_api_key: geminiInput,
                    groq_api_key: groqInput
                  })}
                >
                  Save API Keys
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
