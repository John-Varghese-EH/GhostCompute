import { useState, useEffect, useCallback } from 'react';
import { getDiscoveredPeers, startDiscovery, stopDiscovery, DiscoveredPeer } from '../lib/tauri';

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
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [isSearching]);

  return { peers, isSearching, startSearching, stopSearching };
}
