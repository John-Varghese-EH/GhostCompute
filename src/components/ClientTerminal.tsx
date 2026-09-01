import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../hooks/useConnection';
import { getRemoteModels, getPairedDevices, initiatePairing as invokeInitiatePairing } from '../lib/tauri';
import { useDiscovery } from '../hooks/useDiscovery';
import { useChat } from '../hooks/useChat';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { StatusDot } from './common/StatusDot';
import { IntegrationsPanel } from './IntegrationsPanel';

interface ClientTerminalProps {
  onResetRole: () => void;
}

export const ClientTerminal: React.FC<ClientTerminalProps> = ({ onResetRole }) => {
  const { status, disconnect } = useConnection();
  const { messages, sendMessage, isStreaming } = useChat();
  const [inputVal, setInputVal] = useState('');
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'chat' | 'integrations'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isConnected = typeof status === 'object' && status !== null && 'Connected' in status;
  const isConnecting = typeof status === 'object' && status !== null && 'Connecting' in status;

  const { peers: discoveredPeers, startSearching, stopSearching } = useDiscovery();
  const [pairedDeviceIds, setPairedDeviceIds] = useState<string[]>([]);
  
  useEffect(() => {
    if (!isConnected && !isConnecting) {
      getPairedDevices().then(devices => {
        setPairedDeviceIds(devices.map(d => d.peer_id));
        startSearching();
      }).catch(console.error);
    } else {
      stopSearching();
    }
    return () => { stopSearching(); };
  }, [isConnected, isConnecting, startSearching, stopSearching]);

  useEffect(() => {
    if (!isConnected && !isConnecting && pairedDeviceIds.length > 0) {
      const match = discoveredPeers.find(p => pairedDeviceIds.includes(p.peer_id));
      if (match) {
        // Auto reconnect using initiatePairing which establishes connection and sends pair
        invokeInitiatePairing(match.peer_id).catch(console.error);
      }
    }
  }, [discoveredPeers, pairedDeviceIds, isConnected, isConnecting]);

  useEffect(() => {
    if (isConnected) {
      getRemoteModels().then(models => {
        setRemoteModels(models);
        if (models.length > 0) setSelectedModel(models[0]);
      }).catch(console.error);
    } else {
      setRemoteModels([]);
      setSelectedModel('');
    }
  }, [isConnected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);



  const handleSend = () => {
    if (inputVal.trim() && isConnected) {
      sendMessage(inputVal.trim());
      setInputVal('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Basic markdown rendering helper (bold and code blocks)
  const renderMessageContent = (content: string) => {
    // Simple split by code block ```
    const blocks = content.split('```');
    return blocks.map((block, i) => {
      if (i % 2 === 1) {
        // It's a code block
        return (
          <pre key={i} className="text-mono" style={{ 
            background: 'var(--gc-bg)', 
            padding: 'var(--gc-space-sm)', 
            borderRadius: 'var(--gc-radius-md)',
            border: '1px solid var(--gc-border)',
            overflowX: 'auto',
            marginTop: 'var(--gc-space-xs)',
            marginBottom: 'var(--gc-space-xs)'
          }}>
            <code>{block}</code>
          </pre>
        );
      }
      
      // Regular text block - handle inline code ` and bold **
      let text = block;
      // Bold
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      text = text.replace(/`([^`]+)`/g, '<code class="text-mono" style="background: var(--gc-bg); padding: 2px 4px; border-radius: var(--gc-radius-sm)">$1</code>');
      
      return (
        <span key={i} dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }} />
      );
    });
  };

  return (
    <div className="flex flex-col" style={{ height: '100vh', width: '100vw', background: 'var(--gc-bg)' }}>
      
      {/* Top bar */}
      <div className="flex items-center justify-between" style={{ padding: 'var(--gc-space-md) var(--gc-space-lg)', background: 'var(--gc-surface)', borderBottom: '1px solid var(--gc-border)' }}>
        <div className="flex items-center gap-md">
          <div className="flex flex-col">
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Host Node</span>
            <div className="flex items-center gap-xs">
              <StatusDot status={isConnected ? 'active' : isConnecting ? 'connecting' : 'error'} />
              <span className="text-muted" style={{ fontSize: '12px' }}>
                {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
          </div>
          <Badge variant="info">LAN</Badge>
          {isConnected && <span className="text-muted text-mono" style={{ fontSize: '12px' }}>{status.Connected.latency_ms}ms</span>}
        </div>
        
        <div className="flex items-center gap-md">
          <div className="flex items-center" style={{ background: 'var(--gc-bg)', padding: '2px', borderRadius: 'var(--gc-radius-md)', border: '1px solid var(--gc-border)' }}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '4px 12px',
                border: 'none',
                background: activeTab === 'chat' ? 'var(--gc-surface)' : 'transparent',
                color: activeTab === 'chat' ? 'var(--gc-text)' : 'var(--gc-text-muted)',
                borderRadius: 'var(--gc-radius-sm)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: activeTab === 'chat' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              style={{
                padding: '4px 12px',
                border: 'none',
                background: activeTab === 'integrations' ? 'var(--gc-surface)' : 'transparent',
                color: activeTab === 'integrations' ? 'var(--gc-text)' : 'var(--gc-text-muted)',
                borderRadius: 'var(--gc-radius-sm)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: activeTab === 'integrations' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Integrations
            </button>
          </div>
          
          <select className="input" style={{ width: '150px', padding: '4px 8px', height: 'auto' }} value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={!isConnected || remoteModels.length === 0}>
            {remoteModels.length > 0 ? remoteModels.map(m => (
              <option key={m} value={m}>{m}</option>
            )) : (
              <option value="">No models</option>
            )}
          </select>
          <Button variant="danger" size="sm" onClick={disconnect} disabled={!isConnected}>Disconnect</Button>
          <Button variant="ghost" size="sm" onClick={onResetRole} disabled={isConnected}>Change Role</Button>
        </div>
      </div>

      {/* Messages / Integrations */}
      {activeTab === 'chat' ? (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)' }} className="flex flex-col gap-md">
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className="flex flex-col" 
                style={{ 
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <span className="text-muted" style={{ fontSize: '12px', marginBottom: 'var(--gc-space-xs)' }}>
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <div 
                  style={{
                    background: msg.role === 'user' ? 'var(--gc-surface)' : 'transparent',
                    border: msg.role === 'user' ? '1px solid var(--gc-border)' : 'none',
                    padding: msg.role === 'user' ? 'var(--gc-space-md)' : 0,
                    borderRadius: 'var(--gc-radius-md)',
                    color: 'var(--gc-text)',
                    lineHeight: 1.5,
                    fontSize: '14px'
                  }}
                >
                  {renderMessageContent(msg.content)}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex items-center gap-xs text-muted" style={{ fontSize: '12px', padding: 'var(--gc-space-sm) 0' }}>
                <span className="spinner">...</span> Assistant is typing
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: 'var(--gc-space-lg)', background: 'var(--gc-surface)', borderTop: '1px solid var(--gc-border)' }}>
            <div className="flex gap-sm" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <textarea 
                className="input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message..."
                disabled={!isConnected}
                style={{ 
                  resize: 'none', 
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}
                rows={inputVal.split('\n').length > 1 ? Math.min(inputVal.split('\n').length, 6) : 1}
              />
              <Button 
                onClick={handleSend} 
                disabled={!inputVal.trim() || !isConnected}
                style={{ alignSelf: 'flex-end' }}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)' }}>
          <IntegrationsPanel />
        </div>
      )}
      
    </div>
  );
};
