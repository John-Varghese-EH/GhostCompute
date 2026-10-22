import { useState, useEffect, useCallback } from 'react';
import { getDiscoveredPeers, startDiscovery, stopDiscovery, safeListen, DiscoveredPeer } from '../lib/tauri';

export function useDiscovery() {
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const startSearching = useCallback(async () => {
    try {
      await startDiscovery();
      setIsSearching(true);
    } catch (err) {
      console.error('Failed to start discovery:', err);
    }
  }, []);

  const stopSearching = useCallback(async () => {
    try {
      await stopDiscovery();
      setIsSearching(false);
    } catch (err) {
      console.error('Failed to stop discovery:', err);
    }
  }, []);

  useEffect(() => {
    let intervalId: number;
    let unlistenFn: (() => void) | undefined;

    const fetchPeers = async () => {
      try {
        const found = await getDiscoveredPeers();
        setPeers(found);
      } catch (err) {
        console.error('Failed to get discovered peers:', err);
      }
    };

    if (isSearching) {
      fetchPeers();
      intervalId = window.setInterval(fetchPeers, 2000);

      safeListen('peers-changed', () => {
        fetchPeers();
      }).then(unlisten => {
        unlistenFn = unlisten;
      }).catch(console.error);
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [isSearching]);

  return { peers, isSearching, startSearching, stopSearching };
}
