import { useState, useEffect, useCallback } from 'react';
import {
  getConnectionStatus,
  connectToHost as invokeConnectToHost,
  disconnectFromHost as invokeDisconnectFromHost,
  ConnectionStatus
} from '../lib/tauri';

export const isConnected = (status: ConnectionStatus) => 'Connected' in status;
export const isConnecting = (status: ConnectionStatus) => 'Connecting' in status;
export const isDisconnected = (status: ConnectionStatus) => 'Disconnected' in status;
export const isReconnecting = (status: ConnectionStatus) => 'Reconnecting' in status;

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus>({ Disconnected: null });

  useEffect(() => {
    let intervalId: number;

    const checkStatus = async () => {
      try {
        const currentStatus = await getConnectionStatus();
        setStatus(currentStatus);
      } catch (err) {
        console.error('Failed to get connection status:', err);
        setStatus({ Disconnected: null });
      }
    };

    if (isConnected(status) || isConnecting(status) || isReconnecting(status)) {
      intervalId = window.setInterval(checkStatus, 1000);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [status]);

  const connect = useCallback(async (peerId: string) => {
    try {
      setStatus({ Connecting: null });
      await invokeConnectToHost(peerId);
      // Wait for the polling to pick up the final Connected state
    } catch (err) {
      console.error('Connect failed:', err);
      setStatus({ Disconnected: null });
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await invokeDisconnectFromHost();
      setStatus({ Disconnected: null });
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  }, []);

  return { status, connect, disconnect };
}
