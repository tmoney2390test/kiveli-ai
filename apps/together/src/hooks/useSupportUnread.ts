import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '../lib/api/transport';
import { useAuth } from './useAuth';
export function useSupportUnread(enabled = true) {
  const { session } = useAuth();
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  return useQuery({
    queryKey: ['support', session?.user.id, 'unread'],
    queryFn: () =>
      invoke<
        {
          count: number;
          tickets: Array<
            { id: string; subject: string; ticket_number: number; last_support_reply_at: string }
          >;
        }
      >('together-ops', { action: 'support_unread', expectedUserId: session?.user.id }),
    enabled: enabled && active && !!session?.user.id,
    staleTime: 15000,
    refetchInterval: enabled && active ? 30000 : false,
    retry: 1,
  });
}
