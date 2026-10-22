import React, { useState, useEffect } from 'react';
import { SetupWizard } from './components/SetupWizard';
import { HostConsole } from './components/HostConsole';
import { ClientTerminal } from './components/ClientTerminal';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const [role, setRole] = useState<'host' | 'client' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Check if opened with pairing/tunnel query parameters
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const connectUrl = searchParams.get('connect') || searchParams.get('tunnel') || searchParams.get('host');
      const token = searchParams.get('token');

      if (connectUrl || token) {
        if (connectUrl) localStorage.setItem('gc_auto_connect', connectUrl);
        if (token) localStorage.setItem('gc_auto_token', token);
        localStorage.setItem('gc_role', 'client');
        setRole('client');
        setIsReady(true);
        return;
      }
    } catch (e) {
      console.warn('Failed to parse URL query parameters:', e);
    }

    const savedRole = localStorage.getItem('gc_role') as 'host' | 'client' | null;
    if (savedRole) {
      setRole(savedRole);
    }
    setIsReady(true);
  }, []);

  const handleSetupComplete = (selectedRole: 'host' | 'client') => {
    localStorage.setItem('gc_role', selectedRole);
    setRole(selectedRole);
  };

  const handleResetRole = () => {
    localStorage.removeItem('gc_role');
    localStorage.removeItem('gc_auto_connect');
    localStorage.removeItem('gc_auto_token');
    setRole(null);
  };

  if (!isReady) {
    return null;
  }

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      {!role && (
        <ErrorBoundary scope="SetupWizard" onReset={() => setRole(null)}>
          <SetupWizard onComplete={handleSetupComplete} />
        </ErrorBoundary>
      )}
      {role === 'host' && (
        <ErrorBoundary scope="HostConsole" onReset={handleResetRole}>
          <HostConsole onResetRole={handleResetRole} />
        </ErrorBoundary>
      )}
      {role === 'client' && (
        <ErrorBoundary scope="ClientTerminal" onReset={handleResetRole}>
          <ClientTerminal onResetRole={handleResetRole} />
        </ErrorBoundary>
      )}
    </>
  );
};

export default App;
