import { useState, useEffect, useCallback } from 'react';
import {
  ApiProxyStatus,
  getApiProxyStatus,
  startApiProxy as invokeStartApiProxy,
  stopApiProxy as invokeStopApiProxy,
} from '../lib/tauri';

export function useApiProxy() {
  const [status, setStatus] = useState<ApiProxyStatus>({
    running: false,
    port: 0,
    endpoint: ''
  });

  const refreshStatus = useCallback(async () => {
    try {
      const currentStatus = await getApiProxyStatus();
      setStatus(currentStatus);
    } catch (err) {
      console.error('Failed to fetch api proxy status:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const intervalId = window.setInterval(refreshStatus, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshStatus]);

  const start = useCallback(async () => {
    try {
      await invokeStartApiProxy();
      await refreshStatus();
    } catch (err) {
      console.error('Failed to start api proxy:', err);
    }
  }, [refreshStatus]);

  const stop = useCallback(async () => {
    try {
      await invokeStopApiProxy();
      await refreshStatus();
    } catch (err) {
      console.error('Failed to stop api proxy:', err);
    }
  }, [refreshStatus]);

  return {
    status,
    start,
    stop,
    refreshStatus
  };
}
