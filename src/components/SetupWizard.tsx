import React, { useState } from 'react';
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
        
        <div style={{ marginBottom: 'var(--gc-space-xl)', textAlign: 'center' }}>
          <div className="flex flex-col items-center gap-sm">
            <Logo size={48} className="text-accent" style={{ marginBottom: 'var(--gc-space-sm)' }} />
            <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px' }}>GhostCompute</h1>
            <p className="text-muted" style={{ fontSize: '15px' }}>Peer-to-peer AI compute sharing</p>
          </div>
          <div className="flex justify-center gap-sm" style={{ marginTop: 'var(--gc-space-md)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: step >= 1 ? 'var(--gc-accent)' : 'var(--gc-border)' }} />
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: step >= 2 ? 'var(--gc-accent)' : 'var(--gc-border)' }} />
            {role === 'host' && (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: step >= 3 ? 'var(--gc-accent)' : 'var(--gc-border)' }} />
            )}
          </div>
        </div>

        <div style={{ minHeight: '400px' }}>
          {step === 1 && (
            <div className="flex gap-md">
              <div 
                className="card flex flex-col items-center gap-sm" 
                style={{ 
                  flex: 1, 
                  cursor: 'pointer', 
                  border: role === 'host' ? '1px solid var(--gc-accent)' : '1px solid var(--gc-border)',
                  padding: 'var(--gc-space-xl)'
                }}
                onClick={() => setRole('host')}
              >
                <div style={{ fontSize: '48px' }}>🖥️</div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Host</h3>
                <p className="text-muted text-center" style={{ fontSize: '14px' }}>Share your GPU for AI inference</p>
              </div>

              <div 
                className="card flex flex-col items-center gap-sm" 
                style={{ 
                  flex: 1, 
                  cursor: 'pointer', 
                  border: role === 'client' ? '1px solid var(--gc-accent)' : '1px solid var(--gc-border)',
                  padding: 'var(--gc-space-xl)'
                }}
                onClick={() => setRole('client')}
              >
                <div style={{ fontSize: '48px' }}>💻</div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Client</h3>
                <p className="text-muted text-center" style={{ fontSize: '14px' }}>Use a peer's GPU for AI</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <PairingPanel mode={role!} />
          )}

          {step === 3 && role === 'host' && (
            <div className="card flex flex-col gap-md">
              <div className="flex justify-between items-center">
                <span style={{ fontWeight: 500 }}>Ollama Server</span>
                <div className="flex items-center gap-sm">
                  <span className="text-muted" style={{ fontSize: '14px' }}>
                    {status === 'Running' ? 'Running' : 'Not running'}
                  </span>
                  <StatusDot status={status === 'Running' ? 'active' : 'error'} />
                </div>
              </div>

              <div style={{ marginTop: 'var(--gc-space-md)' }}>
                <h4 style={{ fontSize: '14px', marginBottom: 'var(--gc-space-sm)' }}>Available Models</h4>
                {models.length > 0 ? (
                  <div className="flex flex-col gap-xs">
                    {models.map(m => (
                      <div key={m.name} className="flex justify-between items-center" style={{ padding: 'var(--gc-space-sm)', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 'var(--gc-radius-md)' }}>
                        <span className="text-mono" style={{ fontSize: '14px' }}>{m.name}</span>
                        <span className="text-muted" style={{ fontSize: '12px' }}>{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted" style={{ fontSize: '14px' }}>No models installed.</p>
                )}
              </div>

              <div style={{ marginTop: 'var(--gc-space-md)' }}>
                <h4 style={{ fontSize: '14px', marginBottom: 'var(--gc-space-sm)' }}>Pull New Model</h4>
                <div className="flex gap-sm">
                  <input type="text" className="input" placeholder="e.g. llama3" id="model-input" />
                  <Button onClick={() => {
                    const el = document.getElementById('model-input') as HTMLInputElement;
                    if (el && el.value) pullModel(el.value);
                  }}>Pull</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between" style={{ marginTop: 'var(--gc-space-xl)' }}>
          <Button variant="ghost" onClick={handleBack} disabled={step === 1}>Back</Button>
          <Button onClick={handleNext} disabled={step === 1 && !role}>
            {step === (role === 'host' ? 3 : 2) ? 'Finish Setup' : 'Next'}
          </Button>
        </div>

      </div>
    </div>
  );
};
