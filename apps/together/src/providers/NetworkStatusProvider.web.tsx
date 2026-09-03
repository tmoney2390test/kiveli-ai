import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

export type ConnectionPhase = 'online' | 'offline' | 'reconnected';
type NetworkValue = { online: boolean; phase: ConnectionPhase };
const NetworkContext = createContext<NetworkValue>({ online: true, phase: 'online' });

export function NetworkStatusProvider({ children }: PropsWithChildren) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [phase, setPhase] = useState<ConnectionPhase>(() => typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online');
  const wasOffline = useRef(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    let reset: ReturnType<typeof setTimeout> | undefined;
    const update = (next: boolean) => {
      setOnline(next);
      if (!next) {
        wasOffline.current = true;
        setPhase('offline');
        if (reset) clearTimeout(reset);
      } else if (wasOffline.current) {
        wasOffline.current = false;
        setPhase('reconnected');
        if (reset) clearTimeout(reset);
        reset = setTimeout(() => setPhase('online'), 3_500);
      } else {
        setPhase('online');
      }
    };
    const onOnline = () => update(true);
    const onOffline = () => update(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (reset) clearTimeout(reset);
    };
  }, []);

  const value = useMemo(() => ({ online, phase }), [online, phase]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export const useNetworkStatus = () => useContext(NetworkContext);
