import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { AccountMenu } from './AccountMenu';

type AccountMenuContextValue = {
  openAccountMenu: () => void;
  settingsReady: () => void;
};

const AccountMenuContext = createContext<AccountMenuContextValue | null>(null);

export function AccountMenuHost({ children }: PropsWithChildren) {
  const [visible, setVisible] = useState(false);
  const waitingForSettings = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    waitingForSettings.current = false;
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
  }, []);

  const navigate = useCallback((href: string) => {
    // Keep the account sheet over the web route until Settings has rendered.
    // Otherwise its immediate dismissal exposes an empty frame while the
    // profile route mounts. Native keeps its single-Modal handoff.
    if (Platform.OS === 'web' && href.startsWith('/settings')) {
      waitingForSettings.current = true;
      if (fallback.current) clearTimeout(fallback.current);
      fallback.current = setTimeout(close, 5000);
      router.push(href as never);
      return;
    }
    close();
    router.push(href as never);
  }, [close]);

  const settingsReady = useCallback(() => {
    if (!waitingForSettings.current) return;
    requestAnimationFrame(close);
  }, [close]);

  const value = useMemo(() => ({ openAccountMenu: () => setVisible(true), settingsReady }), [settingsReady]);
  return <AccountMenuContext.Provider value={value}>
    {children}
    <AccountMenu visible={visible} onClose={close} onNavigate={navigate} />
  </AccountMenuContext.Provider>;
}

export function useAccountMenu() {
  const value = useContext(AccountMenuContext);
  if (!value) throw new Error('AccountMenuHost is missing');
  return value;
}
