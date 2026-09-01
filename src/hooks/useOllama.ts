import { useState, useEffect, useCallback } from 'react';
import {
  getOllamaStatus,
  getAvailableModels,
  pullModel as invokePullModel,
  swapModel as invokeSwapModel,
  OllamaStatus,
  ModelInfo,
  PullProgress,
  safeListen
} from '../lib/tauri';

export function useOllama() {
  const [status, setStatus] = useState<OllamaStatus>('NotInstalled');
  const [models, setModels] = useState<ModelInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const currentStatus = await getOllamaStatus();
      setStatus(currentStatus);
      if (currentStatus === 'Running') {
        const availableModels = await getAvailableModels();
        setModels(availableModels);
      }
    } catch (err) {
      console.error('Failed to refresh Ollama status:', err);
      setStatus('NotInstalled');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = safeListen<PullProgress>('pull-progress', (event) => {
      console.log('Pull progress:', event.payload);
      
      const { completed, total, status } = event.payload;
      if (status === 'success' || (completed !== null && total !== null && total > 0 && completed >= total)) {
        refresh();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [refresh]);

  const pullModel = useCallback(async (modelName: string) => {
    try {
      await invokePullModel(modelName);
    } catch (err) {
      console.error('Failed to pull model:', err);
    }
  }, []);

  const swapModel = useCallback(async (modelName: string) => {
    try {
      await invokeSwapModel(modelName);
    } catch (err) {
      console.error('Failed to swap model:', err);
    }
  }, []);

  return { status, models, pullModel, swapModel, refresh };
}
