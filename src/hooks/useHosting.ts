import { useState, useEffect, useCallback } from 'react';
import {
  getActiveSessions,
  startHosting as invokeStartHosting,
  stopHosting as invokeStopHosting,
  killSession as invokeKillSession,
  killAllSessions as invokeKillAllSessions,
  SessionInfo
} from '../lib/tauri';

export function useHosting() {
  const [isHosting, setIsHosting] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    let intervalId: number;

    const checkSessions = async () => {
      try {
        const currentSessions = await getActiveSessions();
        setSessions(currentSessions);
      } catch (err) {
        console.error('Failed to fetch active sessions:', err);
      }
    };

    if (isHosting) {
      checkSessions();
      intervalId = window.setInterval(checkSessions, 3000);
    } else {
      setSessions([]);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isHosting]);

  const startHosting = useCallback(async () => {
    try {
      await invokeStartHosting();
      setIsHosting(true);
    } catch (err) {
      console.error('Failed to start hosting:', err);
    }
  }, []);

  const stopHosting = useCallback(async () => {
    try {
      await invokeStopHosting();
      setIsHosting(false);
    } catch (err) {
      console.error('Failed to stop hosting:', err);
    }
  }, []);

  const killSession = useCallback(async (peer_id: string) => {
    try {
      await invokeKillSession(peer_id);
      setSessions((prev) => prev.filter((s) => s.peer_id !== peer_id));
    } catch (err) {
      console.error('Failed to kill session:', err);
    }
  }, []);

  const killAllSessions = useCallback(async () => {
    try {
      await invokeKillAllSessions();
      setSessions([]);
    } catch (err) {
      console.error('Failed to kill all sessions:', err);
    }
  }, []);

  return {
    isHosting,
    sessions,
    startHosting,
    stopHosting,
    killSession,
    killAllSessions
  };
}
