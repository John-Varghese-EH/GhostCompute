import { useState, useEffect, useCallback } from 'react';

import {
  safeListen,
  getPairingState,
  initiatePairing as invokeInitiatePairing,
  confirmPairing as invokeConfirmPairing,
  generatePairingCode as invokeGenerateCode,
  submitPairingCode as invokeSubmitCode,
  generatePairingLink as invokeGenerateLink,
  connectToUrl as invokeConnectToUrl,
  PairingState
} from '../lib/tauri';

export function usePairing() {
  const [state, setState] = useState<PairingState>('Idle');

  useEffect(() => {
    let intervalId: number;
    let unlisten: any;

    const checkState = async () => {
      try {
        const currentState = await getPairingState();
        setState(currentState);
      } catch (err) {
        console.error('Failed to get pairing state:', err);
      }
    };

    safeListen('pairing-state-changed', () => {
      checkState();
    }).then((un) => {
      unlisten = un;
    }).catch(console.error);

    const isPolling = state === 'Discovering' || (typeof state === 'object' && 'AwaitingConfirmation' in state);
    if (isPolling) {
      intervalId = window.setInterval(checkState, 2000);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (unlisten) unlisten();
    };
  }, [state]);

  const initiatePairing = useCallback(async (peerId: string) => {
    await invokeInitiatePairing(peerId);
    setState('Discovering');
  }, []);

  const confirmPairing = useCallback(async (confirmed: boolean) => {
    await invokeConfirmPairing(confirmed);
  }, []);

  const generateCode = useCallback(async () => {
    const code = await invokeGenerateCode();
    return code;
  }, []);

  const submitCode = useCallback(async (code: string) => {
    await invokeSubmitCode(code);
    setState('Discovering');
  }, []);

  const generateLink = useCallback(async () => {
    const link = await invokeGenerateLink();
    return link;
  }, []);

  const connectToUrl = useCallback(async (url: string) => {
    await invokeConnectToUrl(url);
    setState('Discovering');
  }, []);

  const reset = useCallback(() => {
    setState('Idle');
  }, []);

  return {
    state,
    initiatePairing,
    confirmPairing,
    generateCode,
    submitCode,
    connectToUrl,
    generateLink,
    reset
  };
}
