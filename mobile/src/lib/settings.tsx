import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiClient } from './api';

const SERVER_KEY = 'serverUrl';
const API_KEY = 'apiKey';
// Optional build-time default, e.g. EXPO_PUBLIC_LIFE_TASKS_URL=https://tasks.example.com in mobile/.env.local
const DEFAULT_SERVER = process.env.EXPO_PUBLIC_LIFE_TASKS_URL ?? '';

interface Settings {
  loaded: boolean;
  serverUrl: string;
  apiKey: string;
  api: ApiClient | null;
  save: (serverUrl: string, apiKey: string) => Promise<void>;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(SERVER_KEY), SecureStore.getItemAsync(API_KEY)])
      .then(([url, key]) => {
        setServerUrl(url || DEFAULT_SERVER);
        setApiKey(key ?? '');
      })
      .catch(() => setServerUrl(DEFAULT_SERVER))
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (url: string, key: string) => {
    await SecureStore.setItemAsync(SERVER_KEY, url);
    await SecureStore.setItemAsync(API_KEY, key);
    setServerUrl(url);
    setApiKey(key);
  }, []);

  const api = useMemo(() => (serverUrl ? new ApiClient(serverUrl, apiKey) : null), [serverUrl, apiKey]);

  return (
    <SettingsContext.Provider value={{ loaded, serverUrl, apiKey, api, save }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** The API client for screens that only render once a server is configured. */
export function useApi(): ApiClient {
  const { api } = useSettings();
  if (!api) throw new Error('No server configured');
  return api;
}
