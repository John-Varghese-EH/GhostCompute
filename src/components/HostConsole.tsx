import React, { useState, useEffect } from 'react';
import { useHosting } from '../hooks/useHosting';
import { useOllama } from '../hooks/useOllama';
import { useSettings } from '../hooks/useSettings';
import { getPairedDevices, revokeDevice, TrustedPeer } from '../lib/tauri';
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
  const [devices, setDevices] = useState<TrustedPeer[]>([]);

  useEffect(() => {
    if (settings.cloudflare_token) {
      setTokenInput(settings.cloudflare_token);
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

  return (
    <div className="flex" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Sidebar */}
      <div className="flex flex-col" style={{ width: '250px', background: 'var(--gc-surface)', borderRight: '1px solid var(--gc-border)' }}>
        <div style={{ padding: 'var(--gc-space-lg)', borderBottom: '1px solid var(--gc-border)' }}>
          <div className="flex items-center gap-sm">
            <Logo size={28} className="text-accent" />
            <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.5px' }}>GhostCompute</h1>
          </div>
          <div className="flex items-center gap-sm" style={{ marginTop: 'var(--gc-space-sm)' }}>
            <Badge variant="info">LAN Mode</Badge>
            {settings.cloudflare_token && <Badge variant="success">Tunnel Ready</Badge>}
          </div>
        </div>

        <div className="flex flex-col" style={{ flex: 1, padding: 'var(--gc-space-md) 0' }}>
          {[
            { 
              id: 'sessions', 
              label: 'Sessions', 
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            },
            { 
              id: 'devices', 
              label: 'Paired Devices', 
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
            },
            { 
              id: 'model', 
              label: 'Model', 
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            },
            {
              id: 'integrations',
              label: 'Integrations',
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h8"></path><path d="M12 8v8"></path><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
            },
            { 
              id: 'settings', 
              label: 'Settings', 
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
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
                fontSize: '15px',
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
            <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Active Sessions</h2>
            {sessions.length === 0 ? (
              <EmptyState 
                icon="🔌" 
                title="No active sessions" 
                description="Waiting for clients to connect." 
              />
            ) : (
              <div className="flex flex-col gap-sm">
                {sessions.map(session => (
                  <div key={session.peer_id} className="card flex justify-between items-center">
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
            <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Paired Devices</h2>
            {devices.length === 0 ? (
              <EmptyState 
                icon="📱" 
                title="No paired devices" 
                description="You haven't paired with any clients yet." 
              />
            ) : (
              <div className="flex flex-col gap-sm">
                {devices.map(device => (
                  <div key={device.peer_id} className="card flex justify-between items-center">
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

            <div className="card">
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
            
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: 'var(--gc-space-xs)' }}>
                Cloudflare Tunnel Integration
              </h3>
              <p className="text-muted" style={{ marginBottom: 'var(--gc-space-lg)', fontSize: '14px' }}>
                If you want to expose your host over the internet when local network mDNS discovery is not available, provide a Cloudflare Tunnel token. The server will automatically spawn <code className="text-mono" style={{ background: 'var(--gc-bg)', padding: '2px 6px', borderRadius: '4px' }}>cloudflared</code> when hosting starts.
              </p>
              
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
                  <Button onClick={() => save({ ...settings, cloudflare_token: tokenInput })}>
                    Save Token
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
