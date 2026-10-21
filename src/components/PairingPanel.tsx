import React, { useState, useEffect } from 'react';
import { 
  LuRadio, 
  LuLink2, 
  LuQrCode, 
  LuShieldCheck, 
  LuWifi, 
  LuGlobe,
  LuCopy,
  LuCheck,
  LuClipboard,
  LuHistory,
  LuServer
} from 'react-icons/lu';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePairing } from '../hooks/usePairing';
import { getLocalIp } from '../lib/tauri';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { EmptyState } from './common/EmptyState';
import { StatusDot } from './common/StatusDot';

export interface PairingPanelProps {
  mode: 'host' | 'client' | 'both';
}

export const PairingPanel: React.FC<PairingPanelProps> = ({ mode }) => {
  const [activeTab, setActiveTab] = useState<'nearby' | 'code' | 'link'>('nearby');
  const { peers, isSearching, startSearching, stopSearching } = useDiscovery();
  const { state, initiatePairing, confirmPairing, generateCode, submitCode, generateLink, connectToUrl, reset } = usePairing();

  const [codeInputValue, setCodeInputValue] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');
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
    getLocalIp().then(setLocalIp).catch(console.error);
  }, []);

  useEffect(() => {
    startSearching();
    return () => {
      stopSearching();
    };
  }, [startSearching, stopSearching]);

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

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      {/* Tab bar (Fluid Segmented Control) */}
      <div className="w-full flex justify-center">
        <div className="segmented-control w-full p-1 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)]">
          <button
            type="button"
            className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'nearby' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('nearby')}
          >
            <LuRadio size={14} className={isSearching ? 'breathe-pulse text-accent' : ''} />
            <span>Nearby Discovery</span>
          </button>
          
          <button
            type="button"
            className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'code' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('code')}
          >
            <LuLink2 size={14} />
            <span>Direct IP / Tunnel URL</span>
          </button>

          {(mode === 'host' || mode === 'both') && (
            <button
              type="button"
              className={`segmented-item flex-1 justify-center py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'link' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('link')}
            >
              <LuQrCode size={14} />
              <span>Invitation Link</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Card */}
      <div className="card glass-panel w-full p-6 rounded-2xl bg-[var(--gc-surface)] border border-[var(--gc-border)] shadow-xl min-h-[300px] flex flex-col justify-between">
        
        {/* Nearby Discovery Tab */}
        {activeTab === 'nearby' && (
          <div className="flex flex-col gap-4">
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
                icon={<LuRadio size={28} className="text-accent" />}
                title="No nearby hosts detected yet"
                description="Ensure your host gaming PC is running GhostCompute with Server Mode active on the same local network."
                action={
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={isSearching ? stopSearching : startSearching}
                    className="text-xs px-4"
                  >
                    {isSearching ? 'Pause Scanning' : 'Scan Again'}
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {peers.map((peer) => (
                  <div 
                    key={peer.peer_id} 
                    className="flex justify-between items-center p-3.5 bg-[var(--gc-surface-sunken)] hover:bg-[var(--gc-surface-elevated)] border border-[var(--gc-border)] rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-accent">
                        <LuServer size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--gc-text)] tracking-tight">{peer.device_name}</div>
                        <div className="text-mono text-[var(--gc-text-muted)] text-[11px] mt-0.5">ID: {peer.peer_id.substring(0, 10)}...</div>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="primary"
                      onClick={() => handleConnect(peer.peer_id)}
                      className="text-xs px-4 py-1.5"
                    >
                      Connect
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Direct IP / Tunnel URL Tab */}
        {activeTab === 'code' && (
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-[var(--gc-text)]">Direct Host Connection</h4>
              <p className="text-muted text-xs mt-1 leading-relaxed">
                Enter your Host Gaming PC's LAN IP address or persistent Cloudflare Tunnel URL.
              </p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const val = codeInputValue.trim();
              if (val) {
                if (val.includes('.') || val.startsWith('http')) {
                  saveRecentHost(val);
                  connectToUrl(val);
                } else {
                  submitCode(val);
                }
              }
            }} className="flex gap-2">
              <input
                type="text"
                className="input text-xs flex-1 rounded-xl"
                placeholder="e.g. 192.168.1.150:8384 or https://your-tunnel.trycloudflare.com"
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
                  <LuHistory size={12} />
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
                        connectToUrl(host);
                      }}
                      title={`Connect to ${host}`}
                    >
                      <LuGlobe size={11} className="text-accent" />
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
                  <LuClipboard size={12} />
                  <span>Paste from Clipboard</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  onClick={() => setCodeInputValue(`${localIp}:8384`)}
                >
                  <LuWifi size={12} className="text-emerald-400" />
                  <span>{localIp}:8384 (Local LAN)</span>
                </button>
              </div>
            </div>

            {(mode === 'host' || mode === 'both') && (
              <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                <span className="text-xs text-muted">Generate temporary numeric pairing code:</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleGenerateCode} className="text-xs">
                    Generate Code
                  </Button>
                  {generatedCode && (
                    <span className="text-mono text-base font-bold text-accent tracking-widest px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
                      {generatedCode}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pairing Link Tab (Host Only) */}
        {activeTab === 'link' && (mode === 'host' || mode === 'both') && (
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-white">Generate Client Invitation Link</h4>
              <p className="text-muted text-xs mt-1 leading-relaxed">
                Generates a cryptographically signed link encoding your Cloudflare Tunnel URL and ephemeral Noise XX pairing token.
              </p>
            </div>

            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleGenerateLink} 
              className="self-start text-xs px-4"
            >
              Generate New Invitation Link
            </Button>

            {generatedLink && (
              <div className="flex gap-2 items-center mt-2 p-3 rounded-xl bg-black/60 border border-violet-500/30">
                <input 
                  type="text" 
                  className="input text-mono text-xs flex-1 bg-transparent border-none p-0 select-all" 
                  value={generatedLink} 
                  readOnly 
                />
                <Button 
                  size="sm" 
                  variant="primary"
                  onClick={() => copyLink(generatedLink)}
                  className="shrink-0 text-xs px-3"
                >
                  {copiedLink ? <LuCheck size={14} className="text-emerald-400" /> : <LuCopy size={14} />}
                  <span className="ml-1">{copiedLink ? 'Copied' : 'Copy'}</span>
                </Button>
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
            <LuShieldCheck size={28} />
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
