import React, { useState } from 'react';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { PairingPanel } from './PairingPanel';
import { useOllama } from '../hooks/useOllama';
import { useHosting } from '../hooks/useHosting';
import { StatusDot } from './common/StatusDot';
import { IconBadge } from './common/IconBadge';
import { ThemeToggle } from './common/ThemeToggle';

export interface SetupWizardProps {
  onComplete: (role: 'host' | 'client') => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'host' | 'client' | null>(null);
  
  const { status, models, pullModel, pullProgress, isPulling } = useOllama();
  const { startHosting } = useHosting();

  React.useEffect(() => {
    if (step >= 2 && role === 'host') {
      startHosting().catch(console.error);
    }
  }, [step, role, startHosting]);

  const handleNext = () => {
    if (step === 1 && role) {
      setStep(2);
    } else if (step === 2) {
      if (role === 'host') {
        setStep(3);
      } else {
        onComplete('client');
      }
    } else if (step === 3) {
      onComplete('host');
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const stepTitles = [
    'Choose Operating Mode',
    role === 'host' ? 'LAN Broadcast & Client Pairing' : 'Discover & Connect to Host',
    'Hardware & Model Engine'
  ];

  return (
    <div className="w-full h-screen overflow-y-auto overflow-x-hidden flex flex-col items-center bg-[var(--gc-bg)] relative select-none">
      
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle size="md" />
      </div>

      {/* Background ambient radial lights */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-violet-600/12 blur-[140px] pointer-events-none rounded-full" />
      <div className="fixed bottom-12 right-12 w-[320px] h-[260px] bg-indigo-600/6 blur-[110px] pointer-events-none rounded-full" />

      <div className="w-full max-w-2xl relative z-10 flex flex-col my-auto py-8 sm:py-12 px-4 shrink-0">
        
        {/* Header Branding */}
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="relative mb-3 flex items-center justify-center">
            <img 
              src="/logo.svg" 
              alt="GhostCompute 👻 Logo" 
              className="w-16 h-16 object-contain drop-shadow-[0_0_24px_rgba(139,92,246,0.45)] hover:scale-105 transition-transform duration-300" 
            />
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--gc-text)] flex items-center justify-center gap-2">
            <span>GhostCompute</span>
          </h1>
          <p className="text-[var(--gc-text-muted)] text-xs sm:text-sm mt-1 max-w-md mx-auto leading-relaxed">
            Turn your high-end gaming PC into a private AI server accessible from any laptop.
          </p>

          {/* Stepper Progress Bar */}
          <div className="flex flex-col items-center gap-2 mt-5 w-full max-w-xs">
            <div className="flex justify-between items-center w-full text-[11px] font-medium text-muted">
              <span>Step {step} of {role === 'host' ? 3 : 2}</span>
              <span className="text-white/80">{stepTitles[step - 1]}</span>
            </div>
            <div className="flex items-center gap-2 w-full">
              <span 
                className={`h-1.5 rounded-full transition-all duration-300 flex-1 ${
                  step >= 1 ? 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-white/10'
                }`}
              />
              <span 
                className={`h-1.5 rounded-full transition-all duration-300 flex-1 ${
                  step >= 2 ? 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-white/10'
                }`}
              />
              {role === 'host' && (
                <span 
                  className={`h-1.5 rounded-full transition-all duration-300 flex-1 ${
                    step >= 3 ? 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-white/10'
                  }`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Wizard Step Body */}
        <div className="min-h-[360px] flex flex-col justify-center">
          
          {/* STEP 1: Role Selection Cards */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
              
              {/* Host Node Card */}
              <div 
                className={`double-bezel cursor-pointer transition-all duration-300 group ${
                  role === 'host' ? 'border-violet-500/60 shadow-[0_0_24px_rgba(139,92,246,0.25)]' : 'border-white/10 hover:border-white/20'
                }`}
                onClick={() => setRole('host')}
              >
                <div className={`double-bezel-inner h-full flex flex-col justify-between transition-colors ${
                  role === 'host' ? 'bg-gradient-to-b from-violet-950/40 to-black/85' : 'bg-black/60'
                }`}>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <IconBadge 
                        icon={<Icon name="dns" size={22} />} 
                        variant={role === 'host' ? 'accent' : 'neutral'} 
                        size="lg" 
                        glow={role === 'host'} 
                        className="group-hover:scale-105"
                      />

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        role === 'host' 
                          ? 'bg-violet-600 border-violet-500 shadow-sm' 
                          : 'border-white/20 bg-transparent'
                      }`}>
                        {role === 'host' && <Icon name="check" size={14} className="text-white font-bold" />}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1 tracking-tight">Server Mode (Host)</h3>
                    <p className="text-muted text-xs leading-relaxed mb-4">
                      Gaming PC or GPU workstation serving heavy local LLMs, ComfyUI, and workflows.
                    </p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-white/80">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Native Bare-Metal GPU / CUDA acceleration</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Zero-Trust Cloudflare Tunnel integration</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Multi-user token & RBAC management</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Client Node Card */}
              <div 
                className={`double-bezel cursor-pointer transition-all duration-300 group ${
                  role === 'client' ? 'border-violet-500/60 shadow-[0_0_24px_rgba(139,92,246,0.25)]' : 'border-white/10 hover:border-white/20'
                }`}
                onClick={() => setRole('client')}
              >
                <div className={`double-bezel-inner h-full flex flex-col justify-between transition-colors ${
                  role === 'client' ? 'bg-gradient-to-b from-violet-950/40 to-black/85' : 'bg-black/60'
                }`}>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <IconBadge 
                        icon={<Icon name="laptop_mac" size={22} />} 
                        variant={role === 'client' ? 'blue' : 'neutral'} 
                        size="lg" 
                        glow={role === 'client'} 
                        className="group-hover:scale-105"
                      />

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        role === 'client' 
                          ? 'bg-violet-600 border-violet-500 shadow-sm' 
                          : 'border-white/20 bg-transparent'
                      }`}>
                        {role === 'client' && <Icon name="check" size={14} className="text-white font-bold" />}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1 tracking-tight">Client Mode (Consumer)</h3>
                    <p className="text-muted text-xs leading-relaxed mb-4">
                      Lightweight laptop routing local AI requests directly to your gaming rig.
                    </p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-white/80">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Local daemon proxies port 11434 silently</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Agentic Tools bridge</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      <span>Smart web app shortcuts with auto-redirect</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: Network & Pairing (CLEAN, NO REDUNDANT BOX) */}
          {step === 2 && (
            <div className="w-full animate-fade-in">
              <PairingPanel mode={role!} />
            </div>
          )}

          {/* STEP 3: Models & Launch (Host Only) */}
          {step === 3 && role === 'host' && (
            <div className="w-full card glass-panel flex flex-col gap-5 p-6 animate-fade-in border border-white/10 rounded-2xl bg-[#0c0c14]/90">
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-tight">Ollama Engine Status</span>
                  <span className="text-xs text-muted font-mono">(Bare Metal)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono">
                    {status === 'Running' ? 'Online' : 'Stopped'}
                  </span>
                  <StatusDot status={status === 'Running' ? 'active' : 'error'} />
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Installed Weights / Models
                </h4>
                {models.length > 0 ? (
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {models.map(m => (
                      <div key={m.name} className="flex justify-between items-center px-3.5 py-2.5 bg-black/50 border border-white/5 rounded-xl text-xs">
                        <span className="text-mono font-medium text-white">{m.name}</span>
                        <span className="text-muted text-[11px]">{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center text-xs text-muted">
                    No models cached locally. Pull one below to get started immediately.
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Pull Model to Host
                </h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="input text-xs" 
                    placeholder="e.g. llama3.2:3b, qwen2.5-coder:7b, deepseek-r1:8b" 
                    id="model-input" 
                  />
                  <Button 
                    onClick={() => {
                      const el = document.getElementById('model-input') as HTMLInputElement;
                      if (el && el.value.trim()) {
                        pullModel(el.value.trim());
                        el.value = '';
                      }
                    }}
                    className="flex items-center gap-1.5 shrink-0 px-4"
                  >
                    <Icon name="download" size={16} />
                    <span>Pull</span>
                  </Button>
                </div>

                {(isPulling || pullProgress) && (
                  <div className="mt-3 p-3 rounded-xl bg-violet-950/30 border border-violet-500/30 flex flex-col gap-1.5 animate-fade-in">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-violet-300 flex items-center gap-1.5">
                        <Icon name="download" size={13} className="animate-bounce text-violet-400" />
                        {pullProgress?.status || 'Downloading weights...'}
                      </span>
                      {pullProgress?.completed && pullProgress?.total ? (
                        <span className="text-mono text-muted text-[10px]">
                          {(pullProgress.completed / 1024 / 1024 / 1024).toFixed(2)} GB / {(pullProgress.total / 1024 / 1024 / 1024).toFixed(2)} GB ({Math.round((pullProgress.completed / pullProgress.total) * 100)}%)
                        </span>
                      ) : null}
                    </div>
                    <div className="w-full h-1 bg-black/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-violet-500 transition-all duration-300"
                        style={{
                          width: pullProgress?.completed && pullProgress?.total 
                            ? `${Math.min(100, Math.round((pullProgress.completed / pullProgress.total) * 100))}%`
                            : '100%'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Controls */}
        <div className="flex justify-between items-center mt-8 pt-4 border-t border-white/5">
          <Button 
            variant="ghost" 
            onClick={handleBack} 
            disabled={step === 1} 
            className="flex items-center gap-2 text-xs"
          >
            <Icon name="arrow_back" size={16} />
            <span>Back</span>
          </Button>

          <Button 
            onClick={handleNext} 
            disabled={step === 1 && !role} 
            className="group flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 shadow-md active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>{step === (role === 'host' ? 3 : 2) ? 'Finish Setup & Launch' : 'Continue'}</span>
            <span className="btn-icon-bubble group-hover:translate-x-0.5">
              <Icon name="arrow_forward" size={15} className="text-white" />
            </span>
          </Button>
        </div>

        {/* Author Credit Footer */}
        <div className="mt-8 text-center text-[11px] text-muted/60">
          GhostCompute 👻 • Developed by{' '}
          <a 
            href="https://linkedin.com/in/John--Varghese" 
            target="_blank" 
            rel="noreferrer" 
            className="text-violet-400 hover:text-violet-300 font-medium"
          >
            John Varghese (J0X)
          </a>
          {' '}•{' '}
          <a 
            href="https://github.com/John-Varghese-EH" 
            target="_blank" 
            rel="noreferrer" 
            className="text-violet-400 hover:text-violet-300 font-medium"
          >
            GitHub
          </a>
        </div>

      </div>
    </div>
  );
};
