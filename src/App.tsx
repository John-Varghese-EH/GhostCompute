import React, { useState, useEffect } from 'react';
import { SetupWizard } from './components/SetupWizard';
import { HostConsole } from './components/HostConsole';
import { ClientTerminal } from './components/ClientTerminal';
import { SplashScreen } from './components/SplashScreen';

export const App: React.FC = () => {
  const [role, setRole] = useState<'host' | 'client' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
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
    setRole(null);
  };

  if (!isReady) {
    return null;
  }

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      {!role && <SetupWizard onComplete={handleSetupComplete} />}
      {role === 'host' && <HostConsole onResetRole={handleResetRole} />}
      {role === 'client' && <ClientTerminal onResetRole={handleResetRole} />}
    </>
  );
};

export default App;
