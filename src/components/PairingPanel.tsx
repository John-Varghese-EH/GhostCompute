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
  LuClipboard
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
    <div className="flex flex-col gap-md" style={{ width: '100%', maxWidth: '520px', margin: '0 auto' }}>
      <div className="flex" style={{ borderBottom: '1px solid var(--gc-border)' }}>
        <button
          className={`btn btn-ghost flex items-center justify-center gap-xs ${activeTab === 'nearby' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('nearby')}
          style={{ 
            flex: 1, 
            borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', 
            borderBottom: activeTab === 'nearby' ? '2px solid var(--gc-accent)' : 'none',
            fontSize: '13px'
          }}
        >
          <LuRadio size={14} />
          <span>Nearby</span>
        </button>
        <button
          className={`btn btn-ghost flex items-center justify-center gap-xs ${activeTab === 'code' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('code')}
          style={{ 
            flex: 1, 
            borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', 
            borderBottom: activeTab === 'code' ? '2px solid var(--gc-accent)' : 'none',
            fontSize: '13px'
          }}
        >
          <LuLink2 size={14} />
          <span>Direct / Tunnel</span>
        </button>
        {(mode === 'host' || mode === 'both') && (
          <button
            className={`btn btn-ghost flex items-center justify-center gap-xs ${activeTab === 'link' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('link')}
            style={{ 
              flex: 1, 
              borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', 
              borderBottom: activeTab === 'link' ? '2px solid var(--gc-accent)' : 'none',
              fontSize: '13px'
            }}
          >
            <LuQrCode size={14} />
            <span>Pairing Link</span>
          </button>
        )}
      </div>

      <div className="card glass-panel" style={{ minHeight: '280px' }}>
        {activeTab === 'nearby' && (
          <div className="flex flex-col gap-sm">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--gc-space-sm)' }}>
              <span className="text-muted" style={{ fontSize: '13px' }}>
                {isSearching ? 'Scanning local subnet for GhostCompute hosts...' : 'Discovery idle'}
              </span>
              <StatusDot status={isSearching ? 'connecting' : 'idle'} />
            </div>

            {peers.length === 0 ? (
              <EmptyState
                icon={<LuRadio size={24} />}
                title="No nearby hosts detected"
                description="Ensure the host laptop has started hosting and both laptops share the same Wi-Fi subnet."
                action={
                  <Button variant="ghost" size="sm" onClick={isSearching ? stopSearching : startSearching}>
                    {isSearching ? 'Pause Scanning' : 'Scan Again'}
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-xs">
                {peers.map((peer) => (
                  <div key={peer.peer_id} className="flex justify-between items-center" style={{ padding: 'var(--gc-space-md)', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-md)' }}>
                    <div className="flex items-center gap-sm">
                      <StatusDot status="active" />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{peer.device_name}</div>
                        <div className="text-mono text-muted" style={{ fontSize: '12px' }}>{peer.peer_id.substring(0, 8)}...</div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleConnect(peer.peer_id)}>Connect</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="flex flex-col gap-md">
            <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5 }}>
              Enter the host laptop's local LAN IP (e.g. <code className="text-mono">192.168.x.x</code>) or Cloudflare Quick Tunnel URL.
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              const val = codeInputValue.trim();
              if (val) {
                if (val.includes('.') || val.startsWith('http')) {
                  connectToUrl(val);
                } else {
                  submitCode(val);
                }
              }
            }} className="flex gap-sm">
              <input
                type="text"
                className="input"
                placeholder="e.g. 172.25.211.107 or https://...trycloudflare.com"
                value={codeInputValue}
                onChange={(e) => setCodeInputValue(e.target.value)}
                style={{ flex: 1, fontSize: '13px' }}
              />
              <Button type="submit">Connect</Button>
            </form>

            <div style={{ marginTop: 'var(--gc-space-xs)' }}>
              <div className="flex justify-between items-center">
                <span className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Quick Presets:
                </span>
                <button
                  type="button"
                  className="btn btn-ghost flex items-center gap-xs"
                  style={{ fontSize: '11px', padding: '2px 6px' }}
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setCodeInputValue(text.trim());
                    } catch {}
                  }}
                >
                  <LuClipboard size={12} />
                  <span>Paste</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-xs" style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-ghost flex items-center gap-xs text-mono"
                  style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.03)' }}
                  onClick={() => setCodeInputValue(`${localIp}:8384`)}
                >
                  <LuWifi size={12} />
                  <span>{localIp}:8384 (LAN)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost flex items-center gap-xs text-mono"
                  style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.03)' }}
                  onClick={() => setCodeInputValue('https://burner-restored-johnny-everyone.trycloudflare.com')}
                >
                  <LuGlobe size={12} />
                  <span>trycloudflare.com</span>
                </button>
              </div>
            </div>

            {(mode === 'host' || mode === 'both') && (
              <div style={{ marginTop: 'var(--gc-space-md)', paddingTop: 'var(--gc-space-md)', borderTop: '1px solid var(--gc-border)' }}>
                <p className="text-muted" style={{ fontSize: '13px', marginBottom: 'var(--gc-space-sm)' }}>Or generate a temporary pairing code:</p>
                <div className="flex gap-sm items-center">
                  <Button variant="ghost" size="sm" onClick={handleGenerateCode}>Generate Code</Button>
                  {generatedCode && <span className="text-mono" style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '2px', color: 'var(--gc-accent)' }}>{generatedCode}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'link' && (mode === 'host' || mode === 'both') && (
          <div className="flex flex-col gap-md">
            <p className="text-muted" style={{ fontSize: '13px' }}>
              Generate a cryptographically secured one-time pairing link for the client.
            </p>
            <Button variant="ghost" size="sm" onClick={handleGenerateLink} style={{ alignSelf: 'flex-start' }}>Generate Link</Button>
            {generatedLink && (
              <div className="flex gap-sm items-center">
                <input type="text" className="input text-mono" value={generatedLink} readOnly style={{ fontSize: '12px' }} />
                <Button size="sm" onClick={() => copyLink(generatedLink)}>
                  {copiedLink ? <LuCheck size={14} /> : <LuCopy size={14} />}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

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
        <div className="flex flex-col items-center gap-md">
          <div 
            className="flex items-center justify-center text-accent"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--gc-accent-muted)',
              border: '1px solid var(--gc-border)'
            }}
          >
            <LuShieldCheck size={28} />
          </div>
          <p className="text-muted text-center" style={{ fontSize: '13px', maxWidth: '340px' }}>
            Confirm that the exact security key below matches the display on the other laptop.
          </p>
          <div className="text-mono" style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '4px', background: 'var(--gc-bg)', padding: 'var(--gc-space-md) var(--gc-space-xl)', borderRadius: 'var(--gc-radius-lg)', border: '1.5px solid var(--gc-accent)' }}>
            {typeof state === 'object' && 'AwaitingConfirmation' in state ? state.AwaitingConfirmation.sas : ''}
          </div>
        </div>
      </Modal>
    </div>
  );
};
