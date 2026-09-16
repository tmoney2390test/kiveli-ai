import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { parseSupportDraft } from "./supportRecovery";

// Drafts never share keys across accounts. Writes are serialized so clearing a
// submitted draft cannot be overtaken by an older in-flight persistence write.
export function useSupportDraft<T extends object>(scope: string, initial: T) {
  const { session } = useAuth();
  const key = session?.user.id
    ? `kivelli:support-draft:${session.user.id}:${scope}`
    : null;
  const [state, setState] = useState(initial),
    [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState(false);
  const initialRef = useRef(initial), writes = useRef(Promise.resolve());
  const activeKey = useRef(key);
  activeKey.current = key;
  useEffect(() => {
    let current = true;
    setState(initialRef.current);
    setLoadedKey(null);
    setPersistenceError(false);
    if (!key) return;
    void AsyncStorage.getItem(key).then((raw) => {
      if (!current) return;
      setState(parseSupportDraft(raw, initialRef.current));
    }).catch(() => {
      if (current) setPersistenceError(true);
    }).finally(() => {
      if (current) setLoadedKey(key);
    });
    return () => {
      current = false;
    };
  }, [key]);
  useEffect(() => {
    if (!key || loadedKey !== key) return;
    let current = true;
    writes.current = writes.current.then(() =>
      AsyncStorage.setItem(key, JSON.stringify(state))
    ).then(() => {
      if (current) setPersistenceError(false);
    }).catch(() => {
      if (current) setPersistenceError(true);
    });
    return () => {
      current = false;
    };
  }, [state, key, loadedKey]);
  return {
    draft: key && key === loadedKey ? state : initialRef.current,
    ready: Boolean(key && key === loadedKey),
    persistenceError,
    update: (patch: Partial<T>) => {
      if (activeKey.current === key) {
        setState((current) => ({ ...current, ...patch }));
      }
    },
    clear: () => {
      if (activeKey.current === key) setState(initialRef.current);
    },
  };
}
