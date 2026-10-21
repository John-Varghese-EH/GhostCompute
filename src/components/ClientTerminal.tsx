import React, { useState, useEffect, useRef } from 'react';
import { 
  LuMessageSquare, 
  LuBox, 
  LuActivity, 
  LuSend, 
  LuUser, 
  LuCpu, 
  LuWifi, 
  LuWifiOff,
  LuSparkles,
  LuRadio,
  LuTrash2,
  LuCopy,
  LuCheck,
  LuSlidersHorizontal,
  LuDownload,
  LuShieldCheck,
  LuTerminal,
  LuLayers,
  LuCode,
  LuX,
  LuGlobe
} from 'react-icons/lu';
import { useConnection } from '../hooks/useConnection';
import { getRemoteModels, getPairedDevices } from '../lib/tauri';
import { useDiscovery } from '../hooks/useDiscovery';
import { useChat } from '../hooks/useChat';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { StatusDot } from './common/StatusDot';
import { CodeBlock } from './common/CodeBlock';
import { PairingPanel } from './PairingPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { ResourceMonitor } from './ResourceMonitor';
import { AgentShortcutsPanel } from './AgentShortcutsPanel';
import { connectToHost } from '../lib/tauri';
import { LuBot } from 'react-icons/lu';
import { Logo } from './common/Logo';
import { ThemeToggle } from './common/ThemeToggle';
import { CustomSelect } from './common/CustomSelect';

export interface SystemPersona {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  badge: string;
}

const PERSONA_PRESETS: SystemPersona[] = [
  {
    id: 'general',
    name: 'General Assistant',
    role: 'Conversational & Coding AI',
    description: 'Balanced technical assistant for general development tasks.',
    systemPrompt: '',
    badge: 'Standard',
  },
  {
    id: 'architect',
    name: 'Staff Architect',
    role: 'Systems & Distributed Design',
    description: 'Focuses on scalability, resilience, design patterns, and clean architecture.',
    systemPrompt: 'You are a Senior Staff Software Architect. Provide rigorous, architectural guidance emphasizing scalability, performance bottlenecks, fault tolerance, and clean code principles. Suggest concrete design patterns and trade-offs.',
    badge: 'Architecture',
  },
  {
    id: 'security',
    name: 'Security & QA Auditor',
    role: 'Vulnerability Analysis & Audit',
    description: 'Scans for CVEs, injection vectors, concurrency bugs, and edge case failures.',
    systemPrompt: 'You are a Senior Security Engineer and QA Auditor. Audit code rigorously for memory safety, concurrency races, input sanitization, OWASP vulnerabilities, and edge cases. Provide hardened code replacements.',
    badge: 'Security',
  },
  {
    id: 'devops',
    name: 'DevOps & Terminal Pro',
    role: 'Linux, Docker & Automation',
    description: 'Generates hardened bash scripts, Kubernetes manifests, and CI/CD pipelines.',
    systemPrompt: 'You are an Expert DevOps & Linux Systems Engineer. Output concise, production-ready shell scripts, container configurations, or terminal commands with zero unnecessary chit-chat. Include defensive error trapping.',
    badge: 'DevOps',
  },
];

interface PromptStarter {
  title: string;
  category: string;
  description: string;
  prompt: string;
  icon: React.ReactNode;
}

const PROMPT_STARTERS: PromptStarter[] = [
  {
    title: 'Code Review & Security Audit',
    category: 'Security & QA',
    description: 'Check for memory safety, concurrency bugs, and OWASP vulnerabilities.',
    prompt: 'Review the following code for memory safety, concurrency issues, edge cases, and OWASP security vulnerabilities:\n\n```rust\n// Paste code here\n```',
    icon: <LuShieldCheck size={18} className="text-accent" />,
  },
  {
    title: 'Unit Tests with Edge Cases',
    category: 'Testing',
    description: 'Generate comprehensive unit tests covering boundary conditions and mocks.',
    prompt: 'Write comprehensive unit tests covering happy paths, error handling, and boundary edge cases for this component:\n\n',
    icon: <LuTerminal size={18} className="text-accent" />,
  },
  {
    title: 'Distributed System Architecture',
    category: 'Architecture',
    description: 'Design a scalable, fault-tolerant microservice and data pipeline.',
    prompt: 'Architect a high-performance, fault-tolerant distributed system for:\n- Requirements: \n- Scale: \n- Key Constraints: ',
    icon: <LuLayers size={18} className="text-accent" />,
  },
  {
    title: 'DevOps & Shell Automation',
    category: 'Infrastructure',
    description: 'Write an idempotent, hardened bash deployment script with error traps.',
    prompt: 'Write an automated, idempotent bash deployment script with strict error handling (`set -euo pipefail`) and health checks for:\n\n',
    icon: <LuCode size={18} className="text-accent" />,
  },
];

interface ClientTerminalProps {
  onResetRole: () => void;
}

export const ClientTerminal: React.FC<ClientTerminalProps> = ({ onResetRole }) => {
  const { status, disconnect } = useConnection();
  const { messages, sendMessage, isStreaming, clearMessages } = useChat();
  const [inputVal, setInputVal] = useState('');
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'chat' | 'agents' | 'pairing' | 'integrations' | 'telemetry'>('chat');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedProxy, setCopiedProxy] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<SystemPersona>(PERSONA_PRESETS[0]);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState<number>(0.7);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        connectToHost(match.peer_id).catch(console.error);
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
      let finalPrompt = inputVal.trim();
      const activePrompt = selectedPersona.id === 'custom' 
        ? customSystemPrompt.trim() 
        : selectedPersona.systemPrompt;

      if (activePrompt) {
        finalPrompt = `[System Directive: ${activePrompt} (Temperature: ${temperature.toFixed(2)})]\n\n${finalPrompt}`;
      }

      sendMessage(finalPrompt);
      setInputVal('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStarterClick = (starter: PromptStarter) => {
    setInputVal(starter.prompt);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleExportMarkdown = () => {
    if (messages.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dateStr = new Date().toLocaleString();
    
    let md = `# GhostCompute Session Transcript\n\n`;
    md += `- **Date:** ${dateStr}\n`;
    md += `- **Host Node:** Active Remote Peer\n`;
    md += `- **Model:** ${selectedModel || 'Default'}\n`;
    md += `- **Persona:** ${selectedPersona.name}\n`;
    md += `- **Temperature:** ${temperature.toFixed(2)}\n`;
    md += `- **Messages:** ${messages.length}\n\n`;
    md += `---\n\n`;

    messages.forEach((msg) => {
      const sender = msg.role === 'user' ? '### User' : '### Host Compute Engine';
      let content = msg.content;
      if (msg.role === 'user' && content.startsWith('[System Directive:')) {
        content = content.replace(/^\[System Directive:[^\]]+\]\n\n/, '');
      }
      md += `${sender} (${new Date(msg.timestamp).toLocaleTimeString()})\n\n`;
      md += `${content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghostcompute-session-${timestamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyProxyUrl = () => {
    navigator.clipboard.writeText('http://127.0.0.1:11434');
    setCopiedProxy(true);
    setTimeout(() => setCopiedProxy(false), 2000);
  };

  const renderMessageContent = (content: string) => {
    // Strip system directive tag if present in user message
    let cleanContent = content;
    if (cleanContent.startsWith('[System Directive:')) {
      cleanContent = cleanContent.replace(/^\[System Directive:[^\]]+\]\n\n/, '');
    }

    const blocks = cleanContent.split('```');
    return blocks.map((block, i) => {
      if (i % 2 === 1) {
        const firstLineEnd = block.indexOf('\n');
        let lang = '';
        let code = block;
        if (firstLineEnd !== -1) {
          const candidateLang = block.substring(0, firstLineEnd).trim();
          if (candidateLang && /^[a-zA-Z0-9_-]+$/.test(candidateLang)) {
            lang = candidateLang;
            code = block.substring(firstLineEnd + 1);
          }
        }
        return <CodeBlock key={i} code={code.replace(/\r\n/g, '\n').trimEnd()} language={lang} />;
      }
      
      let text = block;
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/`([^`]+)`/g, '<code class="text-mono" style="background: var(--gc-bg); padding: 2px 4px; border-radius: var(--gc-radius-sm)">$1</code>');
      
      return (
        <span key={i} dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }} />
      );
    });
  };

  return (
    <div className="flex flex-col" style={{ height: '100vh', width: '100vw', background: 'var(--gc-bg)' }}>
      
      {/* Top bar */}
      <div className="flex items-center justify-between" style={{ padding: '12px 20px', background: 'var(--gc-surface)', backdropFilter: 'var(--gc-glass)', WebkitBackdropFilter: 'var(--gc-glass)', borderBottom: '1px solid var(--gc-border)' }}>
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-2 pr-2 border-r border-[var(--gc-border)]">
            <Logo size={22} className="text-accent" />
            <span className="font-bold text-sm tracking-tight text-[var(--gc-text)] hidden sm:inline">GhostCompute</span>
          </div>

          <div className="flex flex-col">
            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.01em' }}>Host Compute Node</span>
            <div className="flex items-center gap-xs">
              <StatusDot status={isConnected ? 'active' : isConnecting ? 'connecting' : 'error'} />
              <span className="text-muted" style={{ fontSize: '12px' }}>
                {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
          </div>
          <Badge variant="info" className="shrink-0">
            <span className="flex items-center gap-xs">
              {isConnected ? <LuWifi size={11} /> : <LuWifiOff size={11} />}
              {isConnected ? 'Active Peer' : 'Offline'}
            </span>
          </Badge>
          {isConnected && (
            <span 
              className="text-mono" 
              style={{ 
                fontSize: '12px',
                color: status.Connected.latency_ms < 60 ? 'var(--gc-success)' : status.Connected.latency_ms < 150 ? 'var(--gc-warning)' : 'var(--gc-text-muted)'
              }}
            >
              {status.Connected.latency_ms}ms
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-md">
          <div className="segmented-control">
            <button
              onClick={() => setActiveTab('chat')}
              className={`segmented-item ${activeTab === 'chat' ? 'active' : ''}`}
            >
              <LuMessageSquare size={13} />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`segmented-item ${activeTab === 'agents' ? 'active' : ''}`}
            >
              <LuBot size={13} />
              <span>Agents & Shortcuts</span>
            </button>
            <button
              onClick={() => setActiveTab('pairing')}
              className={`segmented-item ${activeTab === 'pairing' ? 'active' : ''}`}
            >
              <LuRadio size={13} className={isConnecting ? 'breathe-pulse' : ''} />
              <span>Pairing & Network</span>
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`segmented-item ${activeTab === 'integrations' ? 'active' : ''}`}
            >
              <LuBox size={13} />
              <span>Integrations</span>
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`segmented-item ${activeTab === 'telemetry' ? 'active' : ''}`}
            >
              <LuActivity size={13} />
              <span>Telemetry</span>
            </button>
          </div>

          {activeTab === 'chat' && (
            <button
              onClick={() => setShowStudio(!showStudio)}
              className={`btn ${showStudio ? 'btn-primary' : 'btn-ghost'} flex items-center gap-xs`}
              style={{ fontSize: '13px', padding: '5px 10px' }}
              title="Toggle Prompt Studio & Parameters drawer"
            >
              <LuSlidersHorizontal size={13} />
              <span>Studio</span>
              {selectedPersona.id !== 'general' && (
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>
                  {selectedPersona.badge}
                </span>
              )}
            </button>
          )}
          
          <div style={{ width: '180px' }}>
            <CustomSelect
              value={selectedModel}
              onChange={val => setSelectedModel(val)}
              disabled={!isConnected || remoteModels.length === 0}
              placeholder={remoteModels.length === 0 ? "No models" : "Select model"}
              options={remoteModels.map(m => ({
                value: m,
                label: m,
                description: 'Host GPU Model'
              }))}
            />
          </div>
          <ThemeToggle size="sm" />
          <Button variant="danger" size="sm" onClick={disconnect} disabled={!isConnected}>Disconnect</Button>
          <Button variant="ghost" size="sm" onClick={onResetRole} disabled={isConnected}>Change Role</Button>
        </div>
      </div>

      {/* Main Tab Panels */}
      {activeTab === 'chat' ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {/* Main Chat Column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Messages Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)' }} className="flex flex-col gap-md">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center" style={{ flex: 1, minHeight: '340px' }}>
                  <div 
                    className="flex items-center justify-center text-accent"
                    style={{ 
                      width: '56px', 
                      height: '56px', 
                      borderRadius: '50%', 
                      background: 'var(--gc-accent-muted)',
                      border: '1px solid var(--gc-border)',
                      marginBottom: 'var(--gc-space-md)'
                    }}
                  >
                    <LuSparkles size={26} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Remote Compute Terminal</h3>
                  <p className="text-muted" style={{ fontSize: '13px', maxWidth: '440px', lineHeight: 1.5, marginBottom: 'var(--gc-space-lg)' }}>
                    {isConnected 
                      ? `Connected to host node via encrypted Noise tunnel. Model: ${selectedModel || 'Default'}. Select a prompt starter below or enter a prompt.`
                      : 'Not connected to a host node. Pair with your host gaming laptop over local Wi-Fi or Cloudflare Quick Tunnel to access remote GPU compute.'}
                  </p>

                  {!isConnected ? (
                    <Button onClick={() => setActiveTab('pairing')} className="flex items-center gap-xs">
                      <LuRadio size={14} />
                      <span>Connect to Host Laptop</span>
                    </Button>
                  ) : (
                    /* Bento Prompt Starters Grid */
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
                      gap: 'var(--gc-space-md)', 
                      width: '100%', 
                      maxWidth: '780px',
                      marginTop: 'var(--gc-space-sm)'
                    }}>
                      {PROMPT_STARTERS.map((starter, idx) => (
                        <div
                          key={idx}
                          className="starter-card"
                          onClick={() => handleStarterClick(starter)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{starter.category}</span>
                            {starter.icon}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gc-text)', marginTop: '4px' }}>
                            {starter.title}
                          </div>
                          <div className="text-muted" style={{ fontSize: '12px', lineHeight: 1.4 }}>
                            {starter.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Chat Session Toolbar */
                <div className="flex justify-between items-center" style={{ padding: '0 var(--gc-space-sm)', borderBottom: '1px solid var(--gc-border)', paddingBottom: '8px' }}>
                  <div className="flex items-center gap-sm">
                    <span className="text-muted" style={{ fontSize: '12px' }}>
                      {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                    </span>
                    {selectedPersona.id !== 'general' && (
                      <span className="badge badge-info flex items-center gap-xs" style={{ fontSize: '11px' }}>
                        <span>Persona:</span>
                        <strong>{selectedPersona.name}</strong>
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-xs">
                    <button 
                      onClick={handleExportMarkdown} 
                      className="btn btn-ghost flex items-center gap-xs text-muted"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      title="Download conversation transcript as Markdown (.md)"
                    >
                      <LuDownload size={12} />
                      <span>Export .md</span>
                    </button>
                    <button 
                      onClick={clearMessages} 
                      className="btn btn-ghost flex items-center gap-xs text-muted"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      title="Clear session history"
                    >
                      <LuTrash2 size={12} />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg, i) => (
                <div 
                  key={msg.id || i} 
                  className="flex flex-col" 
                  style={{ 
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div className="flex items-center gap-xs text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>
                    {msg.role === 'user' ? (
                      <>
                        <LuUser size={12} />
                        <span>You</span>
                      </>
                    ) : (
                      <>
                        <LuCpu size={12} className="text-accent" />
                        <span>Host Compute Engine</span>
                      </>
                    )}
                  </div>
                  <div 
                    className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
                    style={{
                      padding: 'var(--gc-space-md) var(--gc-space-lg)',
                      color: 'var(--gc-text)',
                      lineHeight: 1.55,
                      fontSize: '14px',
                      position: 'relative'
                    }}
                  >
                    {renderMessageContent(msg.content)}

                    {msg.role === 'assistant' && !isStreaming && (
                      <div className="flex justify-end" style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '6px' }}>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedMsgId(msg.id || `${i}`);
                            setTimeout(() => setCopiedMsgId(null), 2000);
                          }}
                          className="btn btn-ghost flex items-center gap-xs"
                          style={{ fontSize: '11px', padding: '2px 6px', border: 'none', background: 'transparent', opacity: 0.7 }}
                        >
                          {copiedMsgId === (msg.id || `${i}`) ? <LuCheck size={11} className="text-success" /> : <LuCopy size={11} />}
                          <span>{copiedMsgId === (msg.id || `${i}`) ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && (
                <div className="flex items-center gap-xs text-muted" style={{ fontSize: '12px', padding: 'var(--gc-space-sm) 0' }}>
                  <span className="spinner" /> Host GPU is streaming tokens...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating Unified Composer */}
            <div style={{ padding: '14px 20px 18px', background: 'transparent' }}>
              <div 
                className="glass-panel flex flex-col"
                style={{ 
                  maxWidth: '820px', 
                  margin: '0 auto',
                  padding: '10px 14px 10px',
                  borderRadius: '16px',
                  background: 'rgba(18, 18, 22, 0.85)',
                  border: '1px solid var(--gc-border)',
                  boxShadow: 'var(--gc-shadow-md)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                <textarea 
                  ref={textareaRef}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isConnected ? "Send a prompt, code snippet, or query to host compute..." : "Connect to host node to chat..."}
                  disabled={!isConnected}
                  style={{ 
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--gc-text)',
                    fontFamily: 'var(--gc-font-ui)',
                    fontSize: '13.5px',
                    lineHeight: 1.5,
                    resize: 'none', 
                    minHeight: '38px',
                    maxHeight: '130px',
                    overflowY: 'auto'
                  }}
                  rows={inputVal.split('\n').length > 1 ? Math.min(inputVal.split('\n').length, 6) : 1}
                />

                <div className="flex justify-between items-center" style={{ paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: '4px' }}>
                  <div className="flex items-center gap-sm">
                    {selectedPersona.id !== 'general' && (
                      <span className="badge badge-info" style={{ fontSize: '10px' }}>
                        {selectedPersona.name}
                      </span>
                    )}
                    <span className="text-muted" style={{ fontSize: '11px' }}>
                      Return to send • Shift + Return for new line
                    </span>
                  </div>

                  <div className="flex items-center gap-sm">
                    <button 
                      onClick={copyProxyUrl} 
                      className="btn btn-ghost text-mono flex items-center gap-xs text-muted"
                      style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--gc-radius-sm)' }}
                      title="Click to copy local OpenAI proxy endpoint"
                    >
                      <LuGlobe size={11} />
                      <span>:11434</span>
                      {copiedProxy && <LuCheck size={11} className="text-success" />}
                    </button>

                    <Button 
                      onClick={handleSend} 
                      disabled={!inputVal.trim() || !isConnected}
                      size="sm"
                      style={{ borderRadius: 'var(--gc-radius-full)', padding: '5px 14px' }}
                    >
                      <LuSend size={13} />
                      <span>Send</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Prompt Studio & Parameters Drawer */}
          {showStudio && (
            <div className="studio-drawer">
              <div className="flex items-center justify-between" style={{ padding: 'var(--gc-space-md) var(--gc-space-lg)', borderBottom: '1px solid var(--gc-border)' }}>
                <div className="flex items-center gap-xs">
                  <LuSlidersHorizontal size={14} className="text-accent" />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Prompt Studio</span>
                </div>
                <button 
                  onClick={() => setShowStudio(false)} 
                  className="btn btn-ghost" 
                  style={{ padding: '2px 4px', border: 'none' }}
                  title="Close Studio"
                >
                  <LuX size={15} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-lg)' }} className="flex flex-col gap-lg">
                
                {/* Persona Presets */}
                <div className="flex flex-col gap-xs">
                  <div className="flex justify-between items-center" style={{ marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} className="text-muted">
                      System Persona
                    </label>
                    <Badge variant="info">{selectedPersona.badge}</Badge>
                  </div>
                  
                  <div className="flex flex-col gap-xs">
                    {PERSONA_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPersona(p)}
                        className="btn btn-ghost flex flex-col items-start"
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: 'var(--gc-radius-md)',
                          background: selectedPersona.id === p.id ? 'var(--gc-surface)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${selectedPersona.id === p.id ? 'var(--gc-accent)' : 'var(--gc-border)'}`,
                          boxShadow: selectedPersona.id === p.id ? '0 0 0 2px var(--gc-accent-muted)' : 'none'
                        }}
                      >
                        <div className="flex justify-between items-center" style={{ width: '100%', marginBottom: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gc-text)' }}>{p.name}</span>
                          {selectedPersona.id === p.id && <LuCheck size={13} className="text-accent" />}
                        </div>
                        <span className="text-muted" style={{ fontSize: '11px', lineHeight: 1.3 }}>{p.description}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Persona toggle */}
                  <div style={{ marginTop: 'var(--gc-space-xs)' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPersona({
                        id: 'custom',
                        name: 'Custom Directive',
                        role: 'User Defined',
                        description: 'Custom instructions passed to host LLM.',
                        systemPrompt: customSystemPrompt,
                        badge: 'Custom'
                      })}
                      className="btn btn-ghost flex justify-between items-center"
                      style={{
                        width: '100%',
                        fontSize: '12px',
                        padding: '6px 10px',
                        border: `1px solid ${selectedPersona.id === 'custom' ? 'var(--gc-accent)' : 'var(--gc-border)'}`
                      }}
                    >
                      <span>Custom System Directive</span>
                      {selectedPersona.id === 'custom' && <LuCheck size={12} className="text-accent" />}
                    </button>

                    {selectedPersona.id === 'custom' && (
                      <textarea
                        className="input"
                        placeholder="e.g. Always respond with concise Rust code and benchmark comparisons."
                        value={customSystemPrompt}
                        onChange={(e) => setCustomSystemPrompt(e.target.value)}
                        style={{ marginTop: '6px', fontSize: '12px', minHeight: '60px' }}
                      />
                    )}
                  </div>
                </div>

                {/* Inference Temperature Slider */}
                <div className="flex flex-col gap-xs">
                  <div className="flex justify-between items-center">
                    <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} className="text-muted">
                      Temperature
                    </label>
                    <span className="text-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gc-accent)' }}>
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                  
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--gc-accent)',
                      cursor: 'pointer'
                    }}
                  />

                  <div className="flex justify-between text-muted" style={{ fontSize: '10px' }}>
                    <span>0.0 (Precise / Code)</span>
                    <span>0.7 (Balanced)</span>
                    <span>1.0 (Creative)</span>
                  </div>
                </div>

                {/* Connection & Spec Diagnostics */}
                <div className="flex flex-col gap-xs" style={{ borderTop: '1px solid var(--gc-border)', paddingTop: 'var(--gc-space-md)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} className="text-muted">
                    Active Channel Specs
                  </label>
                  
                  <div className="flex flex-col gap-xs" style={{ background: 'var(--gc-bg)', padding: '10px', borderRadius: 'var(--gc-radius-md)', border: '1px solid var(--gc-border)', fontSize: '12px' }}>
                    <div className="flex justify-between">
                      <span className="text-muted">Protocol</span>
                      <span className="text-mono" style={{ fontSize: '11px' }}>Noise XX + ChaCha20</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Remote LLM</span>
                      <span className="text-mono" style={{ fontSize: '11px' }}>{selectedModel || 'Auto-select'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Local Proxy</span>
                      <span className="text-mono" style={{ fontSize: '11px' }}>:11434</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Round-trip Ping</span>
                      <span className="text-mono" style={{ fontSize: '11px', color: 'var(--gc-success)' }}>
                        {isConnected ? `${status.Connected.latency_ms}ms` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      ) : activeTab === 'agents' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)' }}>
          <AgentShortcutsPanel
            isConnected={isConnected}
            onNavigatePairing={() => setActiveTab('pairing')}
          />
        </div>
      ) : activeTab === 'pairing' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '560px' }}>
            <PairingPanel mode="client" />
          </div>
        </div>
      ) : activeTab === 'integrations' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)' }}>
          <IntegrationsPanel />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-space-xl)', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '600px' }}>
            <ResourceMonitor />
          </div>
        </div>
      )}
      
    </div>
  );
};
