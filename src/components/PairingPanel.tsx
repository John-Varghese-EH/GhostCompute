import React, { useState, useEffect } from 'react';
import { Icon } from './common/Icon';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePairing } from '../hooks/usePairing';
import { useHosting } from '../hooks/useHosting';
import { getLocalIp, getActiveTunnelUrl, startQuickTunnel, safeListen } from '../lib/tauri';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { Modal } from './common/Modal';
import { EmptyState } from './common/EmptyState';
import { StatusDot } from './common/StatusDot';

export interface PairingPanelProps {
  mode: 'host' | 'client' | 'both';
}

export const PairingPanel: React.FC<PairingPanelProps> = ({ mode }) => {
  const [activeTab, setActiveTab] = useState<'broadcast' | 'nearby' | 'code' | 'link'>(() => {
    return mode === 'host' ? 'broadcast' : 'nearby';
  });

  const { isHosting, startHosting } = useHosting();
  const { peers, isSearching, startSearching, stopSearching } = useDiscovery();
  const { state, initiatePairing, confirmPairing, generateCode, submitCode, generateLink, connectToUrl, reset } = usePairing();

  const [codeInputValue, setCodeInputValue] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedLan, setCopiedLan] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedTunnel, setCopiedTunnel] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);

  const [recentHosts, setRecentHosts] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('gc_recent_hosts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveRecentHost = (host: string) => {
    try {
      const raw = localStorage.getItem('gc_recent_hosts');
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter(h => h !== host);
      const updated = [host, ...filtered].slice(0, 4);
      localStorage.setItem('gc_recent_hosts', JSON.stringify(updated));
      setRecentHosts(updated);
    } catch {}
  };

  useEffect(() => {
    const autoTarget = localStorage.getItem('gc_auto_connect');
    if (autoTarget) {
      setCodeInputValue(autoTarget);
      setActiveTab('code');
      localStorage.removeItem('gc_auto_connect');
      connectToUrl(autoTarget);
    }
  }, [connectToUrl]);

  useEffect(() => {
    getLocalIp().then(setLocalIp).catch(console.error);
    getActiveTunnelUrl().then(url => {
      setTunnelUrl(url || null);
      if (url) {
        generateLink().then(setGeneratedLink).catch(console.error);
      }
    }).catch(console.error);

    let unlistenReady: (() => void) | undefined;
    let unlistenCleared: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    safeListen<string>('tunnel-url-ready', (event) => {
      if (event.payload && event.payload.trim().length > 0) {
        setTunnelUrl(event.payload);
        setTunnelError(null);
        generateLink().then(setGeneratedLink).catch(console.error);
      } else {
        setTunnelUrl(null);
      }
    }).then(unlisten => {
      unlistenReady = unlisten;
    }).catch(console.error);

    safeListen('tunnel-url-cleared', () => {
      setTunnelUrl(null);
    }).then(unlisten => {
      unlistenCleared = unlisten;
    }).catch(console.error);

    safeListen<string>('tunnel-error', (event) => {
      if (event.payload) {
        setTunnelError(event.payload);
      }
    }).then(unlisten => {
      unlistenError = unlisten;
    }).catch(console.error);

    return () => {
      if (unlistenReady) unlistenReady();
      if (unlistenCleared) unlistenCleared();
      if (unlistenError) unlistenError();
    };
  }, [generateLink]);

  const handleStartQuickTunnel = async () => {
    setIsStartingTunnel(true);
    try {
      await startQuickTunnel();
    } catch (err) {
      console.error('Failed to start quick tunnel:', err);
    } finally {
      setIsStartingTunnel(false);
    }
  };

  // For Host: Auto-start hosting so mDNS begins broadcasting and TCP listener binds port 8384
  useEffect(() => {
    if (mode === 'host' || mode === 'both') {
      startHosting().catch(console.error);
    }
  }, [mode, startHosting]);

  // For Client: Only search if in client mode or 'both' with nearby tab active
  useEffect(() => {
    if (mode === 'client' || (mode === 'both' && activeTab === 'nearby')) {
      startSearching();
      return () => {
        stopSearching();
      };
    }
  }, [mode, activeTab, startSearching, stopSearching]);

  const handleConnect = async (peerId: string) => {
    await initiatePairing(peerId);
  };

  const handleGenerateCode = async () => {
    const code = await generateCode();
    setGeneratedCode(code);
  };

  const handleGenerateLink = async () => {
    const link = await generateLink();
    setGeneratedLink(link);
  };

  const copyToClipboard = (text: string, type: 'lan' | 'pin' | 'link' | 'tunnel') => {
    navigator.clipboard.writeText(text);
    if (type === 'lan') {
      setCopiedLan(true);
      setTimeout(() => setCopiedLan(false), 2000);
    } else if (type === 'pin') {
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } else if (type === 'tunnel') {
      setCopiedTunnel(true);
      setTimeout(() => setCopiedTunnel(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isPaired = typeof state === 'object' && 'Completed' in state;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      
      {/* Tab bar (Fluid Segmented Control) */}
      <div className="w-full flex justify-center">
        <div className="segmented-control w-full p-1 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)]">
          
          {/* Host Mode Tabs */}
          {(mode === 'host' || mode === 'both') && (
            <button
              type="button"
              className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'broadcast' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('broadcast')}
            >
              <Icon name="sensors" size={16} className={isHosting ? 'breathe-pulse text-emerald-400' : 'text-accent'} />
              <span>LAN Broadcast</span>
            </button>
          )}

          {/* Client Mode Tabs */}
          {(mode === 'client' || mode === 'both') && (
            <button
              type="button"
              className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'nearby' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('nearby')}
            >
              <Icon name="sensors" size={16} className={isSearching ? 'breathe-pulse text-accent' : ''} />
              <span>Nearby Discovery</span>
            </button>
          )}

          {(mode === 'client' || mode === 'both') && (
            <button
              type="button"
              className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'code' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('code')}
            >
              <Icon name="link" size={16} />
              <span>Direct IP / Tunnel URL</span>
            </button>
          )}

          {(mode === 'host' || mode === 'both') && (
            <button
              type="button"
              className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'link' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('link')}
            >
              <Icon name="qr_code_2" size={16} />
              <span>Invitation Link</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Card */}
      <div className="card glass-panel w-full p-6 rounded-2xl bg-[var(--gc-surface)] border border-[var(--gc-border)] shadow-xl min-h-[320px] flex flex-col justify-between">
        
        {/* ================= HOST BROADCAST TAB ================= */}
        {activeTab === 'broadcast' && (mode === 'host' || mode === 'both') && (
          <div className="flex flex-col gap-5 animate-fade-in">
            
            {/* Top Status Beacon */}
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Icon name="sensors" size={18} className="animate-pulse" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--gc-text)] flex items-center gap-2">
                    <span>Broadcasting as Host</span>
                    <Badge variant="success" className="squircle-badge py-0.5 px-2 text-[10px] font-bold tracking-wider uppercase">
                      LAN Active
                    </Badge>
                  </div>
                  <div className="text-xs text-[var(--gc-text-muted)] font-mono mt-0.5">
                    mDNS: _ghostcompute._tcp.local. • Port 8384
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[var(--gc-text-muted)]">
                  {isHosting ? 'Listening' : 'Starting...'}
                </span>
                <StatusDot status={isHosting ? 'active' : 'connecting'} />
              </div>
            </div>

            {/* Host LAN Endpoint Address Box */}
            <div className="p-4 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-[var(--gc-text-muted)] uppercase tracking-wider">
                  Your Machine's LAN Address
                </span>
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <Icon name="wifi" size={14} />
                  <span>Wi-Fi / Ethernet Ready</span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-sm sm:text-base font-mono font-bold text-white tracking-wide truncate">
                    http://{localIp}:8384
                  </span>
                </div>
                <Button 
                  size="sm" 
                  variant="primary"
                  onClick={() => copyToClipboard(`http://${localIp}:8384`, 'lan')}
                  className="shrink-0 text-xs px-3.5 py-1.5 flex items-center gap-1.5"
                >
                  {copiedLan ? <Icon name="check" size={14} className="text-emerald-300" /> : <Icon name="content_copy" size={14} />}
                  <span>{copiedLan ? 'Copied!' : 'Copy Address'}</span>
                </Button>
              </div>

              <p className="text-[11px] text-[var(--gc-text-muted)] leading-relaxed">
                GhostCompute on your client laptop will automatically discover this PC on the same Wi-Fi. If your network blocks mDNS discovery, paste the address above into the client's Direct IP tab.
              </p>
            </div>

            {/* Cloudflare Tunnel Status Card (Auto-started Free or Configured) */}
            <div className="p-4 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-[var(--gc-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="public" size={15} className="text-violet-400" />
                  <span>Public Zero-Trust Tunnel</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={tunnelUrl ? "ghost" : "primary"}
                    onClick={handleStartQuickTunnel}
                    disabled={isStartingTunnel}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1"
                  >
                    <Icon 
                      name={isStartingTunnel ? "refresh" : "bolt"} 
                      size={12} 
                      className={isStartingTunnel ? "animate-spin text-accent" : tunnelUrl ? "text-accent" : "text-white"} 
                    />
                    <span>{isStartingTunnel ? "Starting..." : (tunnelUrl ? "Restart Tunnel" : "Start Quick Tunnel")}</span>
                  </Button>
                  {tunnelUrl ? (
                    <Badge variant="success" className="squircle-badge py-0.5 px-2 text-[10px] font-bold tracking-wider uppercase">
                      Live Tunnel Ready
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="squircle-badge py-0.5 px-2 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
                      Offline
                    </Badge>
                  )}
                </div>
              </div>

              {tunnelUrl ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-violet-950/20 border border-violet-500/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                    <span className="text-xs sm:text-sm font-mono font-bold text-violet-200 tracking-tight truncate">
                      {tunnelUrl}
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="primary"
                    onClick={() => copyToClipboard(generatedLink || tunnelUrl, 'tunnel')}
                    className="shrink-0 text-xs px-3.5 py-1.5 flex items-center gap-1.5"
                  >
                    {copiedTunnel ? <Icon name="check" size={14} className="text-emerald-300" /> : <Icon name="content_copy" size={14} />}
                    <span>{copiedTunnel ? 'Copied!' : 'Copy Tunnel URL'}</span>
                  </Button>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-[var(--gc-text-muted)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />
                    <span>Quick Tunnel is currently offline. Automatically clears when disconnected.</span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleStartQuickTunnel}
                    disabled={isStartingTunnel}
                    className="shrink-0 text-xs px-3 py-1 flex items-center gap-1"
                  >
                    <Icon name="bolt" size={12} />
                    <span>Launch</span>
                  </Button>
                </div>
              )}

              {tunnelError && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <Icon name="warning" size={14} className="text-amber-400 shrink-0" />
                    <span>{tunnelError}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={handleStartQuickTunnel} className="text-[11px] px-2 py-0.5">
                    Retry
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-[var(--gc-text-muted)] leading-relaxed">
                Allows connecting securely over cellular, hotels, or coffee shops without port forwarding or VPNs.
              </p>
            </div>

            {/* Temporary Pairing PIN */}
            <div className="p-4 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-[var(--gc-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="key" size={15} className="text-accent" />
                  <span>Temporary Pairing PIN (Fast Connect)</span>
                </span>
                {generatedCode && (
                  <span className="text-[11px] text-[var(--gc-text-muted)] font-mono">
                    Valid for 10 min
                  </span>
                )}
              </div>

              {generatedCode ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-violet-950/20 border border-violet-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-mono text-xl sm:text-2xl font-extrabold tracking-[4px] text-accent">
                      {generatedCode}
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => copyToClipboard(generatedCode, 'pin')}
                    className="shrink-0 text-xs px-3 py-1 flex items-center gap-1.5"
                  >
                    {copiedPin ? <Icon name="check" size={14} className="text-emerald-400" /> : <Icon name="content_copy" size={14} />}
                    <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--gc-text-muted)]">
                    Generate a one-time 6-digit code for instant pairing.
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleGenerateCode}
                    className="text-xs px-3.5 py-1.5 border border-white/10 hover:border-white/20"
                  >
                    Generate PIN
                  </Button>
                </div>
              )}
            </div>

            {/* Client Status Indicator */}
            {isPaired ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Icon name="check" size={14} className="font-bold" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white">Client Successfully Connected & Paired!</div>
                  <div className="text-muted">You can proceed to the next step to select models and launch.</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/5">
                <div className="relative flex items-center justify-center w-6 h-6 rounded-md bg-violet-500/10 text-accent shrink-0">
                  <Icon name="sensors" size={15} className="animate-pulse" />
                </div>
                <div className="text-xs text-[var(--gc-text-muted)] flex-1 leading-relaxed">
                  Waiting for client connection... When your laptop connects, cryptographic verification (SAS) will prompt here.
                </div>
              </div>
            )}

          </div>
        )}

        {/* ================= NEARBY DISCOVERY TAB (CLIENT) ================= */}
        {activeTab === 'nearby' && (mode === 'client' || mode === 'both') && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-muted text-xs">
                {isSearching ? 'Scanning local Wi-Fi subnet for GhostCompute hosts...' : 'Discovery scan idle'}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span>{isSearching ? 'Scanning' : 'Paused'}</span>
                <StatusDot status={isSearching ? 'connecting' : 'idle'} />
              </div>
            </div>

            {peers.length === 0 ? (
              <EmptyState
                icon={<Icon name="sensors" size={32} className="text-accent animate-pulse" />}
                title="No nearby hosts detected yet"
                description="Ensure your host gaming PC is on Step 2 ('LAN Broadcast') or running in Server Mode on the same local Wi-Fi network."
                action={
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={isSearching ? stopSearching : startSearching}
                      className="text-xs px-4"
                    >
                      <Icon name="refresh" size={13} className={isSearching ? 'animate-spin' : ''} />
                      <span className="ml-1.5">{isSearching ? 'Pause Scan' : 'Scan Again'}</span>
                    </Button>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => setActiveTab('code')}
                      className="text-xs px-4"
                    >
                      <Icon name="link" size={13} />
                      <span className="ml-1.5">Direct IP Connect</span>
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center mb-1">
                  <div className="text-[11px] font-semibold text-[var(--gc-text-muted)] uppercase tracking-wider">
                    Discovered GhostCompute Hosts ({peers.length}):
                  </div>
                  <Badge variant="info" className="squircle-badge py-0.5 px-2 text-[10px] font-bold">
                    mDNS Verified
                  </Badge>
                </div>
                {peers.map((peer) => {
                  const sortedAddrs = [...peer.addresses].sort((a, b) => {
                    const isA192 = a.startsWith('192.168.');
                    const isB192 = b.startsWith('192.168.');
                    if (isA192 && !isB192) return -1;
                    if (!isA192 && isB192) return 1;
                    return 0;
                  });
                  const primaryAddr = sortedAddrs[0] || 'LAN';

                  return (
                    <div 
                      key={peer.peer_id} 
                      className="flex justify-between items-center p-3.5 bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-surface-elevated)] border border-[var(--gc-border)] rounded-xl transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-accent shrink-0">
                          <Icon name="dns" size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[var(--gc-text)] tracking-tight truncate flex items-center gap-2">
                            <span>{peer.device_name}</span>
                            <span className="text-[10px] py-0.5 px-1.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-medium">
                              Ready
                            </span>
                          </div>
                          <div className="text-mono text-[var(--gc-text-muted)] text-[11px] mt-0.5 truncate flex items-center gap-1.5">
                            <span>{primaryAddr}:{peer.port}</span>
                            {sortedAddrs.length > 1 && (
                              <span className="text-[10px] text-zinc-500">
                                (+{sortedAddrs.length - 1} alt IP{sortedAddrs.length > 2 ? 's' : ''})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button 
                          size="sm" 
                          variant="primary"
                          onClick={() => handleConnect(peer.peer_id)}
                          className="text-xs px-4 py-1.5 font-bold shadow-md shadow-violet-500/20"
                        >
                          Auto-Pair
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= DIRECT IP / TUNNEL URL TAB (CLIENT) ================= */}
        {activeTab === 'code' && (mode === 'client' || mode === 'both') && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div>
              <h4 className="text-sm font-semibold text-[var(--gc-text)]">Direct Host Connection</h4>
              <p className="text-muted text-xs mt-1 leading-relaxed">
                Enter your Host Gaming PC's LAN IP address, 6-digit pairing PIN, or persistent Cloudflare Tunnel URL.
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const val = codeInputValue.trim();
              if (val) {
                if (val.includes('.') || val.startsWith('http')) {
                  saveRecentHost(val);
                  connectToUrl(val).catch((err) => {
                    console.error('Connection attempt failed:', err);
                  });
                } else {
                  submitCode(val).catch((err) => {
                    console.error('Code submit failed:', err);
                  });
                }
              }
            }} className="flex gap-2">
              <input
                type="text"
                className="input text-xs flex-1 rounded-xl"
                placeholder="e.g. https://xxx.trycloudflare.com/?token=..., 192.168.1.150:8384, or 6-digit PIN"
                value={codeInputValue}
                onChange={(e) => setCodeInputValue(e.target.value)}
              />
              <Button type="submit" variant="primary" className="text-xs px-5 shrink-0">
                Connect
              </Button>
            </form>

            {/* Recent Hosts */}
            {recentHosts.length > 0 && (
              <div className="pt-2">
                <span className="text-muted flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2">
                  <Icon name="history" size={12} />
                  <span>Recent Host Targets:</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {recentHosts.map((host, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-surface-elevated)] border border-[var(--gc-border)] text-[11px] font-mono text-[var(--gc-text)] transition-colors cursor-pointer flex items-center gap-1"
                      onClick={() => {
                        setCodeInputValue(host);
                        connectToUrl(host).catch((err) => {
                          console.error('Recent host connection failed:', err);
                        });
                      }}
                      title={`Connect to ${host}`}
                    >
                      <Icon name="public" size={11} className="text-accent" />
                      <span className="truncate max-w-[180px]">{host}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Presets */}
            <div className="pt-2 border-t border-white/5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">
                  Quick Presets:
                </span>
                <button
                  type="button"
                  className="text-xs text-accent hover:text-accent-light flex items-center gap-1 cursor-pointer"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setCodeInputValue(text.trim());
                    } catch {}
                  }}
                >
                  <Icon name="content_paste" size={12} />
                  <span>Paste from Clipboard</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  onClick={() => setCodeInputValue(`${localIp}:8384`)}
                >
                  <Icon name="wifi" size={12} className="text-emerald-400" />
                  <span>{localIp}:8384 (Local LAN)</span>
                </button>
              </div>
            </div>

            {/* Live Error Banner */}
            {typeof state === 'object' && 'Failed' in state && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-xs text-red-300 animate-fade-in">
                <Icon name="error_outline" size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block text-red-200 mb-0.5">Connection Failed</span>
                  <p className="leading-relaxed opacity-90">{state.Failed.reason}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= INVITATION LINK TAB (HOST) ================= */}
        {activeTab === 'link' && (mode === 'host' || mode === 'both') && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div>
              <h4 className="text-sm font-semibold text-white">Generate Client Invitation Link</h4>
              <p className="text-muted text-xs mt-1 leading-relaxed">
                Generates a cryptographically signed link encoding your host endpoint and ephemeral Noise XX pairing token.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleGenerateLink} 
                className="text-xs px-4"
              >
                <Icon name="auto_awesome" size={13} />
                <span className="ml-1.5">{generatedLink ? 'Regenerate Link' : 'Generate Invitation Link'}</span>
              </Button>

              <span className="text-[11px] text-[var(--gc-text-muted)] font-mono">
                Target: {tunnelUrl ? 'Cloudflare Tunnel (Global)' : `http://${localIp}:8384 (LAN)`}
              </span>
            </div>

            {generatedLink ? (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex gap-2 items-center p-3 rounded-xl bg-black/60 border border-violet-500/30">
                  <input 
                    type="text" 
                    className="input text-mono text-xs flex-1 bg-transparent border-none p-0 select-all" 
                    value={generatedLink} 
                    readOnly 
                  />
                  <Button 
                    size="sm" 
                    variant="primary"
                    onClick={() => copyToClipboard(generatedLink, 'link')}
                    className="shrink-0 text-xs px-3"
                  >
                    {copiedLink ? <Icon name="check" size={14} className="text-emerald-400" /> : <Icon name="content_copy" size={14} />}
                    <span className="ml-1">{copiedLink ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--gc-text-muted)]">
                  Copy and paste this link into the Client device's <b>Direct IP / Tunnel URL</b> tab to instantly pair and connect.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] text-xs text-[var(--gc-text-muted)]">
                Click <b>Generate Invitation Link</b> above to build a 1-click URL for your client laptop.
              </div>
            )}
          </div>
        )}

      </div>

      {/* SAS Cryptographic Confirmation Modal */}
      <Modal
        open={typeof state === 'object' && 'AwaitingConfirmation' in state}
        onClose={reset}
        title="Verify Cryptographic SAS Code"
        footer={
          <>
            <Button variant="ghost" onClick={() => { confirmPairing(false); reset(); }}>Reject</Button>
            <Button onClick={() => confirmPairing(true)}>Confirm Match</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-accent">
            <Icon name="verified_user" size={28} />
          </div>
          <p className="text-muted text-center text-xs max-w-xs leading-relaxed">
            Verify that the 6-character cryptographic verification string below matches the display on the peer machine.
          </p>
          <div className="text-mono text-2xl font-bold tracking-[8px] text-[var(--gc-accent)] bg-[var(--gc-surface-sunken)] px-6 py-3 rounded-xl border border-[var(--gc-border)] shadow-inner">
            {typeof state === 'object' && 'AwaitingConfirmation' in state ? state.AwaitingConfirmation.sas : ''}
          </div>
        </div>
      </Modal>
    </div>
  );
};
