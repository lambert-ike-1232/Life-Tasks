import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Loads data whenever the screen comes into focus (so edits made on a pushed
 * screen show up on return) and exposes pull-to-refresh state.
 */
export function useLoader<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, setData, error, refreshing, reload, refresh: () => reload(true) };
}
