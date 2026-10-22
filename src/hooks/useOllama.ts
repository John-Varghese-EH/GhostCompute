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
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [isPulling, setIsPulling] = useState<boolean>(false);

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
      const progress = event.payload;
      setPullProgress(progress);
      setIsPulling(true);

      const { completed, total, status: pStatus } = progress;
      if (pStatus === 'success' || (completed !== null && total !== null && total > 0 && completed >= total)) {
        setIsPulling(false);
        setPullProgress(null);
        refresh();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [refresh]);

  const pullModel = useCallback(async (modelName: string) => {
    try {
      setIsPulling(true);
      setPullProgress({ status: `Initiating download of ${modelName}...`, completed: null, total: null });
      await invokePullModel(modelName);
    } catch (err) {
      console.error('Failed to pull model:', err);
      setIsPulling(false);
      setPullProgress(null);
    }
  }, []);

  const swapModel = useCallback(async (modelName: string) => {
    try {
      await invokeSwapModel(modelName);
      await refresh();
    } catch (err) {
      console.error('Failed to swap model:', err);
    }
  }, [refresh]);

  return { status, models, pullModel, swapModel, refresh, pullProgress, isPulling };
}
