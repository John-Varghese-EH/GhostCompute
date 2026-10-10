import React, { useState } from 'react';
import { LuServer, LuLaptop, LuCheck, LuArrowRight, LuArrowLeft } from 'react-icons/lu';
import { Button } from './common/Button';
import { PairingPanel } from './PairingPanel';
import { useOllama } from '../hooks/useOllama';
import { StatusDot } from './common/StatusDot';
import { Logo } from './common/Logo';

export interface SetupWizardProps {
  onComplete: (role: 'host' | 'client') => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'host' | 'client' | null>(null);
  
  const { status, models, pullModel } = useOllama();

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

  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: '100vh', padding: 'var(--gc-space-xl)' }}>
      <div style={{ width: '100%', maxWidth: '640px' }}>
        
        {/* Header Branding */}
        <div style={{ marginBottom: 'var(--gc-space-xl)', textAlign: 'center' }}>
          <div className="flex flex-col items-center gap-xs">
            <div 
              className="flex items-center justify-center text-accent"
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--gc-border)',
                boxShadow: 'var(--gc-shadow-sm)',
                marginBottom: '12px'
              }}
            >
              <Logo size={32} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, letterSpacing: '-0.025em' }}>GhostCompute</h1>
            <p className="text-muted" style={{ fontSize: '14px' }}>Peer-to-peer remote GPU compute sharing</p>
          </div>

          {/* Stepper Pill Indicators */}
          <div className="flex justify-center items-center gap-xs" style={{ marginTop: '18px' }}>
            <span 
              style={{ 
                width: step === 1 ? '24px' : '8px', 
                height: '4px', 
                borderRadius: '4px', 
                background: step >= 1 ? 'var(--gc-accent)' : 'rgba(255, 255, 255, 0.12)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }} 
            />
            <span 
              style={{ 
                width: step === 2 ? '24px' : '8px', 
                height: '4px', 
                borderRadius: '4px', 
                background: step >= 2 ? 'var(--gc-accent)' : 'rgba(255, 255, 255, 0.12)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }} 
            />
            {role === 'host' && (
              <span 
                style={{ 
                  width: step === 3 ? '24px' : '8px', 
                  height: '4px', 
                  borderRadius: '4px', 
                  background: step >= 3 ? 'var(--gc-accent)' : 'rgba(255, 255, 255, 0.12)',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }} 
              />
            )}
          </div>
        </div>

        {/* Wizard Step Body */}
        <div style={{ minHeight: '380px' }}>
          {step === 1 && (
            <div className="flex gap-md">
              
              {/* Host Node Card */}
              <div 
                className="card glass-panel flex flex-col justify-between" 
                style={{ 
                  flex: 1, 
                  cursor: 'pointer', 
                  border: role === 'host' ? '1px solid var(--gc-accent)' : '1px solid var(--gc-border)',
                  background: role === 'host' ? 'rgba(10, 132, 255, 0.06)' : 'var(--gc-surface)',
                  padding: '24px 20px',
                  borderRadius: '16px',
                  boxShadow: role === 'host' ? '0 0 0 1px var(--gc-accent), var(--gc-shadow-md)' : 'var(--gc-shadow-sm)',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative'
                }}
                onClick={() => setRole('host')}
              >
                <div>
                  <div className="flex justify-between items-start" style={{ marginBottom: '16px' }}>
                    <div 
                      className="flex items-center justify-center text-accent"
                      style={{ 
                        width: '46px', 
                        height: '46px', 
                        borderRadius: '12px',
                        background: role === 'host' ? 'var(--gc-accent-muted)' : 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--gc-border)'
                      }}
                    >
                      <LuServer size={22} />
                    </div>

                    <div 
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: `1.5px solid ${role === 'host' ? 'var(--gc-accent)' : 'rgba(255, 255, 255, 0.2)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: role === 'host' ? 'var(--gc-accent)' : 'transparent',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {role === 'host' && <LuCheck size={12} style={{ color: '#ffffff' }} />}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '6px', letterSpacing: '-0.02em' }}>Host Compute Node</h3>
                  <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.45, marginBottom: '14px' }}>
                    Gaming laptop or workstation with dedicated GPU serving local LLMs via Ollama.
                  </p>
                </div>

                <div className="flex flex-col gap-xs" style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: 'var(--gc-radius-sm)', fontSize: '12px' }}>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Dedicated GPU model execution
                  </div>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Peer-to-peer Noise encryption
                  </div>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Multi-client session manager
                  </div>
                </div>
              </div>

              {/* Client Node Card */}
              <div 
                className="card glass-panel flex flex-col justify-between" 
                style={{ 
                  flex: 1, 
                  cursor: 'pointer', 
                  border: role === 'client' ? '1px solid var(--gc-accent)' : '1px solid var(--gc-border)',
                  background: role === 'client' ? 'rgba(10, 132, 255, 0.06)' : 'var(--gc-surface)',
                  padding: '24px 20px',
                  borderRadius: '16px',
                  boxShadow: role === 'client' ? '0 0 0 1px var(--gc-accent), var(--gc-shadow-md)' : 'var(--gc-shadow-sm)',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative'
                }}
                onClick={() => setRole('client')}
              >
                <div>
                  <div className="flex justify-between items-start" style={{ marginBottom: '16px' }}>
                    <div 
                      className="flex items-center justify-center text-accent"
                      style={{ 
                        width: '46px', 
                        height: '46px', 
                        borderRadius: '12px',
                        background: role === 'client' ? 'var(--gc-accent-muted)' : 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--gc-border)'
                      }}
                    >
                      <LuLaptop size={22} />
                    </div>

                    <div 
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: `1.5px solid ${role === 'client' ? 'var(--gc-accent)' : 'rgba(255, 255, 255, 0.2)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: role === 'client' ? 'var(--gc-accent)' : 'transparent',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {role === 'client' && <LuCheck size={12} style={{ color: '#ffffff' }} />}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '6px', letterSpacing: '-0.02em' }}>Client Node</h3>
                  <p className="text-muted" style={{ fontSize: '13px', lineHeight: 1.45, marginBottom: '14px' }}>
                    Lightweight laptop connecting over Wi-Fi or tunnel to leverage remote GPU compute.
                  </p>
                </div>

                <div className="flex flex-col gap-xs" style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: 'var(--gc-radius-sm)', fontSize: '12px' }}>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Zero local GPU required
                  </div>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Local OpenAI proxy (:11434)
                  </div>
                  <div className="text-muted flex items-center gap-xs">
                    <span style={{ color: 'var(--gc-accent)' }}>•</span> Works with Cursor, Continue & CLI
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <PairingPanel mode={role!} />
          )}

          {step === 3 && role === 'host' && (
            <div className="card glass-panel flex flex-col gap-md" style={{ padding: '24px' }}>
              <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--gc-border)', paddingBottom: '12px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Ollama Daemon Status</span>
                <div className="flex items-center gap-sm">
                  <span className="text-muted" style={{ fontSize: '13px' }}>
                    {status === 'Running' ? 'Online' : 'Offline'}
                  </span>
                  <StatusDot status={status === 'Running' ? 'active' : 'error'} />
                </div>
              </div>

              <div style={{ marginTop: 'var(--gc-space-sm)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gc-text-muted)', marginBottom: 'var(--gc-space-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Installed Models
                </h4>
                {models.length > 0 ? (
                  <div className="flex flex-col gap-xs">
                    {models.map(m => (
                      <div key={m.name} className="flex justify-between items-center" style={{ padding: '8px 12px', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-sm)' }}>
                        <span className="text-mono" style={{ fontSize: '13px' }}>{m.name}</span>
                        <span className="text-muted" style={{ fontSize: '12px' }}>{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted" style={{ fontSize: '13px' }}>No models installed yet.</p>
                )}
              </div>

              <div style={{ marginTop: 'var(--gc-space-sm)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gc-text-muted)', marginBottom: 'var(--gc-space-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pull New Model
                </h4>
                <div className="flex gap-sm">
                  <input type="text" className="input" placeholder="e.g. llama3.2:1b" id="model-input" />
                  <Button onClick={() => {
                    const el = document.getElementById('model-input') as HTMLInputElement;
                    if (el && el.value) pullModel(el.value);
                  }}>Pull</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Controls */}
        <div className="flex justify-between items-center" style={{ marginTop: 'var(--gc-space-xl)' }}>
          <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="flex items-center gap-xs">
            <LuArrowLeft size={14} />
            <span>Back</span>
          </Button>
          <Button onClick={handleNext} disabled={step === 1 && !role} className="flex items-center gap-xs">
            <span>{step === (role === 'host' ? 3 : 2) ? 'Finish Setup' : 'Continue'}</span>
            <LuArrowRight size={14} />
          </Button>
        </div>

      </div>
    </div>
  );
};
