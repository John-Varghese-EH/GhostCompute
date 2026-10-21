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
  LuGlobe,
  LuChevronRight,
  LuFlame,
  LuZap
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

  // High-fidelity Markdown renderer with support for lists, headers, quotes, tables, and inline code
  const formatMarkdownText = (raw: string): string => {
    let text = raw;
    // Headers
    text = text.replace(/^### (.*$)/gim, '<h4 style="font-size: 14.5px; font-weight: 700; margin: 10px 0 4px; color: var(--gc-text);">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 style="font-size: 16px; font-weight: 700; margin: 12px 0 6px; color: var(--gc-text);">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 style="font-size: 18px; font-weight: 700; margin: 14px 0 8px; color: var(--gc-text);">$1</h2>');
    // Bold & italic
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Blockquote
    text = text.replace(/^\> (.*$)/gim, '<blockquote style="border-left: 3px solid var(--gc-accent); padding-left: 10px; margin: 6px 0; color: var(--gc-text-muted); font-style: italic;">$1</blockquote>');
    // Unordered lists
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 18px; margin-bottom: 2px;">$1</li>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="text-mono" style="background: var(--gc-surface-sunken); border: 1px solid var(--gc-border); padding: 2px 5px; border-radius: var(--gc-squircle-sm); corner-shape: squircle; font-size: 12px; color: var(--gc-accent-light);">$1</code>');
    // Newlines
    text = text.replace(/\n/g, '<br/>');
    return text;
  };

  const renderMessageContent = (content: string) => {
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
      
      return (
        <span key={i} dangerouslySetInnerHTML={{ __html: formatMarkdownText(block) }} />
      );
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--gc-bg)' }}>
      
      {/* Top bar (Responsive & Scalable) */}
      <header 
        className="flex items-center justify-between px-4 py-2.5 z-20 shrink-0 border-b transition-colors"
        style={{ 
          background: 'var(--gc-surface)', 
          backdropFilter: 'var(--gc-glass)', 
          WebkitBackdropFilter: 'var(--gc-glass)', 
          borderColor: 'var(--gc-border)' 
        }}
      >
        {/* Left Section: Brand & Peer Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-[var(--gc-border)]">
            <Logo size={22} className="text-accent" />
            <span className="font-bold text-sm tracking-tight text-[var(--gc-text)] hidden md:inline">GhostCompute</span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold tracking-tight text-[var(--gc-text)]">Host Node</span>
              {isConnected && (
                <span 
                  className="text-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-sm"
                  style={{ 
                    background: 'var(--gc-surface-sunken)',
                    color: status.Connected.latency_ms < 60 ? 'var(--gc-success)' : status.Connected.latency_ms < 150 ? 'var(--gc-warning)' : 'var(--gc-text-muted)',
                    border: '1px solid var(--gc-border)'
                  }}
                  title="Round-trip latency to remote host"
                >
                  {status.Connected.latency_ms}ms
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot status={isConnected ? 'active' : isConnecting ? 'connecting' : 'error'} />
              <span className="text-muted text-[11.5px]">
                {isConnected ? 'Peer Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <Badge variant={isConnected ? 'success' : 'neutral'} className="hidden sm:inline-flex">
            <span className="flex items-center gap-1">
              {isConnected ? <LuWifi size={11} /> : <LuWifiOff size={11} />}
              <span>{isConnected ? 'ENCRYPTED' : 'OFFLINE'}</span>
            </span>
          </Badge>
        </div>
        
        {/* Right Section: Navigation Tabs & Session Controls */}
        <div className="flex items-center gap-2.5">
          <nav className="segmented-control">
            <button
              onClick={() => setActiveTab('chat')}
              className={`segmented-item ${activeTab === 'chat' ? 'active' : ''}`}
              title="Remote AI Chat Terminal"
            >
              <LuMessageSquare size={13} />
              <span className="hidden lg:inline">Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`segmented-item ${activeTab === 'agents' ? 'active' : ''}`}
              title="Autonomous Agents & Quick Tool Presets"
            >
              <LuBot size={13} />
              <span className="hidden lg:inline">Agents</span>
            </button>
            <button
              onClick={() => setActiveTab('pairing')}
              className={`segmented-item ${activeTab === 'pairing' ? 'active' : ''}`}
              title="Pairing, Network Discovery & Remote Nodes"
            >
              <LuRadio size={13} className={isConnecting ? 'breathe-pulse text-accent' : ''} />
              <span className="hidden lg:inline">Pairing</span>
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`segmented-item ${activeTab === 'integrations' ? 'active' : ''}`}
              title="Tool Integrations & Quick Start configs"
            >
              <LuBox size={13} />
              <span className="hidden lg:inline">Integrations</span>
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`segmented-item ${activeTab === 'telemetry' ? 'active' : ''}`}
              title="System Telemetry & VRAM Usage"
            >
              <LuActivity size={13} />
              <span className="hidden lg:inline">Telemetry</span>
            </button>
          </nav>

          {activeTab === 'chat' && (
            <button
              onClick={() => setShowStudio(!showStudio)}
              className={`btn squircle-sm ${showStudio ? 'btn-primary' : 'btn-ghost'} flex items-center gap-1.5`}
              style={{ 
                fontSize: '12px', 
                padding: '4px 10px',
                borderRadius: 'var(--gc-squircle-sm)'
              }}
              title="Toggle Prompt Studio & Parameter tuning drawer"
            >
              <LuSlidersHorizontal size={13} />
              <span className="hidden sm:inline">Studio</span>
              {selectedPersona.id !== 'general' && (
                <span className="badge badge-info" style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                  {selectedPersona.badge}
                </span>
              )}
            </button>
          )}
          
          <div className="w-[140px] sm:w-[170px]">
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

          {isConnected ? (
            <Button 
              variant="danger" 
              size="sm" 
              onClick={disconnect}
              className="squircle-sm"
              style={{
                borderRadius: 'var(--gc-squircle-sm)',
                padding: '4px 11px',
                fontSize: '12px'
              }}
            >
              Disconnect
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onResetRole}
              className="squircle-sm"
              style={{
                borderRadius: 'var(--gc-squircle-sm)',
                padding: '4px 11px',
                fontSize: '12px'
              }}
            >
              Change Role
            </Button>
          )}
        </div>
      </header>

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
                    <div 
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[760px] mt-4"
                    >
                      {PROMPT_STARTERS.map((starter, idx) => (
                        <div
                          key={idx}
                          className="starter-card group"
                          onClick={() => handleStarterClick(starter)}
                        >
                          <div className="flex items-center justify-between">
                            <span 
                              className="badge badge-neutral squircle-badge" 
                              style={{ 
                                fontSize: '10px', 
                                padding: '2px 8px',
                                borderRadius: 'var(--gc-squircle-badge)'
                              }}
                            >
                              {starter.category}
                            </span>
                            <div className="p-1.5 rounded-lg bg-[var(--gc-surface-sunken)] group-hover:bg-[var(--gc-accent-muted)] transition-colors">
                              {starter.icon}
                            </div>
                          </div>
                          <div className="text-[13.5px] font-semibold text-[var(--gc-text)] mt-1 tracking-tight flex items-center justify-between">
                            <span>{starter.title}</span>
                            <LuChevronRight size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-muted text-[12px] leading-relaxed m-0">
                            {starter.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Chat Session Toolbar */
                <div 
                  className="flex justify-between items-center px-3 py-2 border-b shrink-0"
                  style={{ borderColor: 'var(--gc-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-[11.5px] font-medium">
                      {messages.length} {messages.length === 1 ? 'turn' : 'turns'}
                    </span>
                    {selectedPersona.id !== 'general' && (
                      <span 
                        className="badge badge-info squircle-badge flex items-center gap-1"
                        style={{ 
                          fontSize: '10.5px',
                          borderRadius: 'var(--gc-squircle-badge)'
                        }}
                      >
                        <LuSparkles size={10} />
                        <span>{selectedPersona.name}</span>
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={handleExportMarkdown} 
                      className="btn btn-ghost squircle-sm flex items-center gap-1 text-muted"
                      style={{ 
                        fontSize: '11px', 
                        padding: '3px 9px',
                        borderRadius: 'var(--gc-squircle-sm)'
                      }}
                      title="Download full conversation transcript as Markdown (.md)"
                    >
                      <LuDownload size={12} />
                      <span>Export .md</span>
                    </button>
                    <button 
                      onClick={clearMessages} 
                      className="btn btn-ghost squircle-sm flex items-center gap-1 text-muted hover:text-danger"
                      style={{ 
                        fontSize: '11px', 
                        padding: '3px 9px',
                        borderRadius: 'var(--gc-squircle-sm)'
                      }}
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
                  className="flex flex-col animate-fade-in" 
                  style={{ 
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div className="flex items-center gap-1.5 text-muted text-[11px] mb-1 px-1">
                    {msg.role === 'user' ? (
                      <>
                        <LuUser size={12} />
                        <span className="font-medium">You</span>
                        <span className="text-[10px] text-dim font-mono">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    ) : (
                      <>
                        <LuCpu size={12} className="text-accent" />
                        <span className="font-medium">Host Compute Node</span>
                        <span className="text-[10px] text-dim font-mono">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>
                  <div 
                    className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
                    style={{
                      padding: '12px 18px',
                      lineHeight: 1.6,
                      fontSize: '13.5px',
                      position: 'relative'
                    }}
                  >
                    {renderMessageContent(msg.content)}

                    {msg.role === 'assistant' && !isStreaming && (
                      <div 
                        className="flex items-center justify-between mt-2 pt-2 border-t"
                        style={{ borderColor: 'var(--gc-border)' }}
                      >
                        <span className="text-[10.5px] text-dim font-mono flex items-center gap-1">
                          <LuZap size={10} className="text-accent" />
                          <span>{selectedModel || 'GPU Node'}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              setCopiedMsgId(msg.id || `${i}`);
                              setTimeout(() => setCopiedMsgId(null), 2000);
                            }}
                            className="btn btn-ghost squircle-sm flex items-center gap-1 text-muted hover:text-[var(--gc-text)]"
                            style={{ 
                              fontSize: '11px', 
                              padding: '2px 8px',
                              borderRadius: 'var(--gc-squircle-sm)',
                              background: copiedMsgId === (msg.id || `${i}`) ? 'var(--gc-success-muted)' : 'transparent',
                              color: copiedMsgId === (msg.id || `${i}`) ? 'var(--gc-success)' : undefined
                            }}
                          >
                            {copiedMsgId === (msg.id || `${i}`) ? <LuCheck size={11} className="text-success" /> : <LuCopy size={11} />}
                            <span>{copiedMsgId === (msg.id || `${i}`) ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && (
                <div className="flex items-center gap-2 text-muted text-[12px] py-2 animate-fade-in">
                  <span className="spinner text-accent" /> 
                  <span>Host GPU is streaming inference tokens...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating Unified Composer (Theme Aware & Squircle Geometry) */}
            <div className="p-3 sm:p-4 shrink-0 bg-transparent">
              <div 
                className="flex flex-col squircle-lg transition-all"
                style={{ 
                  maxWidth: '820px', 
                  margin: '0 auto',
                  padding: '10px 14px 10px',
                  borderRadius: 'var(--gc-radius-lg)',
                  background: 'var(--gc-surface)',
                  backdropFilter: 'var(--gc-glass)',
                  WebkitBackdropFilter: 'var(--gc-glass)',
                  border: '1px solid var(--gc-border)',
                  boxShadow: 'var(--gc-shadow-md)'
                }}
              >
                <textarea 
                  ref={textareaRef}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isConnected ? `Send a prompt to ${selectedModel || 'remote compute node'}...` : "Connect to host node to chat..."}
                  disabled={!isConnected}
                  style={{ 
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--gc-text)',
                    fontFamily: 'var(--gc-font-ui)',
                    fontSize: '13.5px',
                    lineHeight: 1.55,
                    resize: 'none', 
                    minHeight: '38px',
                    maxHeight: '140px',
                    overflowY: 'auto'
                  }}
                  rows={inputVal.split('\n').length > 1 ? Math.min(inputVal.split('\n').length, 6) : 1}
                />

                <div 
                  className="flex justify-between items-center pt-2 mt-1 border-t"
                  style={{ borderColor: 'var(--gc-border)' }}
                >
                  <div className="flex items-center gap-2">
                    {selectedPersona.id !== 'general' && (
                      <span 
                        className="badge badge-info squircle-badge" 
                        style={{ 
                          fontSize: '9.5px', 
                          padding: '2px 7px',
                          borderRadius: 'var(--gc-squircle-badge)'
                        }}
                      >
                        {selectedPersona.name}
                      </span>
                    )}
                    <span className="text-muted text-[11px] hidden sm:inline">
                      Return to send • Shift + Return for newline
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {inputVal.trim() && (
                      <span className="text-[10.5px] text-muted font-mono hidden md:inline">
                        ~{Math.round(inputVal.length / 4)} tokens
                      </span>
                    )}

                    <button 
                      onClick={copyProxyUrl} 
                      className="btn btn-ghost squircle-sm text-mono flex items-center gap-1 text-muted hover:text-[var(--gc-text)]"
                      style={{ 
                        fontSize: '11px', 
                        padding: '3px 8px', 
                        borderRadius: 'var(--gc-squircle-sm)',
                        border: '1px solid var(--gc-border)',
                        background: 'var(--gc-surface-sunken)'
                      }}
                      title="Click to copy local OpenAI proxy endpoint (127.0.0.1:11434)"
                    >
                      <LuGlobe size={11} />
                      <span>:11434</span>
                      {copiedProxy && <LuCheck size={11} className="text-success" />}
                    </button>

                    <Button 
                      onClick={handleSend} 
                      disabled={!inputVal.trim() || !isConnected}
                      size="sm"
                      className="squircle-sm"
                      style={{ 
                        borderRadius: 'var(--gc-squircle-sm)',
                        padding: '5px 14px',
                        fontSize: '12.5px'
                      }}
                    >
                      <LuSend size={13} />
                      <span>Send</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Prompt Studio & Parameters Drawer (G2/G3 Eased Slide-In) */}
          {showStudio && (
            <div className="studio-drawer">
              <div 
                className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                style={{ borderColor: 'var(--gc-border)' }}
              >
                <div className="flex items-center gap-1.5">
                  <LuSlidersHorizontal size={14} className="text-accent" />
                  <span className="text-[13px] font-semibold text-[var(--gc-text)]">Prompt Studio</span>
                </div>
                <button 
                  onClick={() => setShowStudio(false)} 
                  className="btn btn-ghost squircle-sm" 
                  style={{ padding: '4px', border: 'none', borderRadius: 'var(--gc-squircle-sm)' }}
                  title="Close Studio"
                >
                  <LuX size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                
                {/* Persona Presets */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      System Persona
                    </label>
                    <Badge variant="info">{selectedPersona.badge}</Badge>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    {PERSONA_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPersona(p)}
                        className="btn btn-ghost squircle-md flex flex-col items-start transition-all"
                        style={{
                          textAlign: 'left',
                          padding: '8px 11px',
                          borderRadius: 'var(--gc-squircle-md)',
                          background: selectedPersona.id === p.id ? 'var(--gc-surface-elevated)' : 'var(--gc-surface-sunken)',
                          border: `1px solid ${selectedPersona.id === p.id ? 'var(--gc-accent)' : 'var(--gc-border)'}`,
                          boxShadow: selectedPersona.id === p.id ? '0 0 0 1px var(--gc-accent)' : 'none'
                        }}
                      >
                        <div className="flex justify-between items-center w-full mb-0.5">
                          <span className="text-[12.5px] font-semibold text-[var(--gc-text)]">{p.name}</span>
                          {selectedPersona.id === p.id && <LuCheck size={13} className="text-accent" />}
                        </div>
                        <span className="text-muted text-[11px] leading-tight">{p.description}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Persona toggle */}
                  <div className="mt-1">
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
                      className="btn btn-ghost squircle-sm flex justify-between items-center w-full text-[12px] py-1.5 px-2.5 transition-all"
                      style={{
                        borderRadius: 'var(--gc-squircle-sm)',
                        border: `1px solid ${selectedPersona.id === 'custom' ? 'var(--gc-accent)' : 'var(--gc-border)'}`,
                        background: selectedPersona.id === 'custom' ? 'var(--gc-surface-elevated)' : 'transparent'
                      }}
                    >
                      <span>Custom System Directive</span>
                      {selectedPersona.id === 'custom' && <LuCheck size={12} className="text-accent" />}
                    </button>

                    {selectedPersona.id === 'custom' && (
                      <textarea
                        className="input squircle-sm mt-2"
                        placeholder="e.g. Always respond with concise Rust code and benchmark comparisons."
                        value={customSystemPrompt}
                        onChange={(e) => setCustomSystemPrompt(e.target.value)}
                        style={{ 
                          fontSize: '12px', 
                          minHeight: '65px',
                          borderRadius: 'var(--gc-squircle-sm)'
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Inference Temperature Slider */}
                <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--gc-border)' }}>
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                      <LuFlame size={12} className="text-accent" />
                      <span>Temperature</span>
                    </label>
                    <span className="text-mono text-[12px] font-semibold text-accent">
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
                    className="w-full accent-[var(--gc-accent)] cursor-pointer"
                  />

                  <div className="flex justify-between text-muted text-[10px]">
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
