import React, { useState, useEffect } from 'react';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePairing } from '../hooks/usePairing';
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

  return (
    <div className="flex flex-col gap-md" style={{ width: '100%', maxWidth: '480px', margin: '0 auto' }}>
      <div className="flex" style={{ borderBottom: '1px solid var(--gc-border)' }}>
        <button
          className={`btn btn-ghost ${activeTab === 'nearby' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('nearby')}
          style={{ flex: 1, borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', borderBottom: activeTab === 'nearby' ? '2px solid var(--gc-accent)' : 'none' }}
        >
          Nearby
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'code' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('code')}
          style={{ flex: 1, borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', borderBottom: activeTab === 'code' ? '2px solid var(--gc-accent)' : 'none' }}
        >
          Manual Connect
        </button>
        {(mode === 'host' || mode === 'both') && (
          <button
            className={`btn btn-ghost ${activeTab === 'link' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('link')}
            style={{ flex: 1, borderRadius: 'var(--gc-radius-md) var(--gc-radius-md) 0 0', borderBottom: activeTab === 'link' ? '2px solid var(--gc-accent)' : 'none' }}
          >
            Pairing Link
          </button>
        )}
      </div>

      <div className="card" style={{ minHeight: '280px' }}>
        {activeTab === 'nearby' && (
          <div className="flex flex-col gap-sm">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--gc-space-sm)' }}>
              <span className="text-muted" style={{ fontSize: '14px' }}>
                {isSearching ? 'Searching for devices...' : 'Discovery paused'}
              </span>
              <StatusDot status={isSearching ? 'connecting' : 'idle'} />
            </div>

            {peers.length === 0 ? (
              <EmptyState
                icon="📡"
                title="No peers found"
                description="Make sure the other device is on the same network and discovery is active."
                action={
                  <Button variant="ghost" onClick={isSearching ? stopSearching : startSearching}>
                    {isSearching ? 'Stop Searching' : 'Search Again'}
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-xs">
                {peers.map((peer) => (
                  <div key={peer.peer_id} className="flex justify-between items-center" style={{ padding: 'var(--gc-space-sm)', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-md)' }}>
                    <div className="flex items-center gap-sm">
                      <StatusDot status="active" />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{peer.device_name}</div>
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
            <p className="text-muted" style={{ fontSize: '14px' }}>
              Enter a pairing code, IP address, or Cloudflare URL.
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
                placeholder="e.g. 123-456 or https://..."
                value={codeInputValue}
                onChange={(e) => setCodeInputValue(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit">Connect</Button>
            </form>
            {(mode === 'host' || mode === 'both') && (
              <div style={{ marginTop: 'var(--gc-space-lg)' }}>
                <p className="text-muted" style={{ fontSize: '14px', marginBottom: 'var(--gc-space-sm)' }}>Or generate a code for the other device:</p>
                <div className="flex gap-sm items-center">
                  <Button variant="ghost" onClick={handleGenerateCode}>Generate Code</Button>
                  {generatedCode && <span className="text-mono" style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>{generatedCode}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'link' && (mode === 'host' || mode === 'both') && (
          <div className="flex flex-col gap-md">
            <p className="text-muted" style={{ fontSize: '14px' }}>
              Generate a pairing link to share with the client.
            </p>
            <Button variant="ghost" onClick={handleGenerateLink} style={{ alignSelf: 'flex-start' }}>Generate Link</Button>
            {generatedLink && (
              <div className="flex gap-sm items-center">
                <input type="text" className="input" value={generatedLink} readOnly />
                <Button onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={typeof state === 'object' && 'AwaitingConfirmation' in state}
        onClose={reset}
        title="Confirm Pairing"
        footer={
          <>
            <Button variant="ghost" onClick={() => { confirmPairing(false); reset(); }}>Reject</Button>
            <Button onClick={() => confirmPairing(true)}>Confirm</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-md">
          <p className="text-muted text-center">Verify that the code below matches the code on the other device.</p>
          <div className="text-mono" style={{ fontSize: '32px', fontWeight: 500, letterSpacing: '4px', background: 'var(--gc-bg)', padding: 'var(--gc-space-md) var(--gc-space-xl)', borderRadius: 'var(--gc-radius-md)', border: '1px solid var(--gc-border)' }}>
            {typeof state === 'object' && 'AwaitingConfirmation' in state ? state.AwaitingConfirmation.sas : ''}
          </div>
        </div>
      </Modal>
    </div>
  );
};
