import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'kivelli:call-display:v1';
type Preferences = { captions: boolean; credits: boolean };
const defaults: Preferences = { captions: true, credits: true };

export function useCallDisplayPreferences() {
  const [preferences, setPreferences] = useState(defaults);
  const current = useRef(defaults);
  const changed = useRef<Partial<Preferences>>({});
  const hydrated = useRef(false);
  const writes = useRef(Promise.resolve());
  const save = useCallback((value: Preferences) => {
    // Keep rapid taps in order, including on slower native storage.
    writes.current = writes.current.catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      try {
        const value: unknown = stored ? JSON.parse(stored) : null;
        if (value && typeof value === 'object') {
          const entry = value as Partial<Preferences>;
          return {
            captions: typeof entry.captions === 'boolean' ? entry.captions : defaults.captions,
            credits: typeof entry.credits === 'boolean' ? entry.credits : defaults.credits,
          };
        }
      } catch { /* An older or unreadable preference uses the defaults. */ }
      return defaults;
    }).catch(() => defaults).then((stored) => {
      if (!active) return;
      const next = { ...stored, ...changed.current };
      current.current = next;
      hydrated.current = true;
      setPreferences(next);
      if (Object.keys(changed.current).length) save(next);
    });
    return () => { active = false; };
  }, [save]);

  const toggle = useCallback((key: keyof Preferences) => {
    const next = { ...current.current, [key]: !current.current[key] };
    changed.current[key] = next[key];
    current.current = next;
    setPreferences(next);
    if (hydrated.current) save(next);
  }, [save]);

  return { ...preferences, toggle };
}
