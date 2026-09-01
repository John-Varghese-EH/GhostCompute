import { useState, useEffect } from 'react';
import { getSettings, saveSettings, AppSettings } from '../lib/tauri';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({ cloudflare_token: null } as AppSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const save = async (newSettings: AppSettings) => {
    try {
      await saveSettings(newSettings);
      setSettings(newSettings);
      return true;
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  };

  return { settings, save, isLoading, loadSettings };
}
