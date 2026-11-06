import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useAuth } from '../hooks/useAuth';
import { createClientRequestId } from './requestId';

// Keep the same key after an uncertain response, so retrying cannot duplicate a ticket/reply.
export function useSupportRequest() {
  const { session } = useAuth();
  const owner = useRef(session?.user.id), alive = useRef(true);
  owner.current = session?.user.id;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pending = useRef<{ signature: string; requestId: string } | null>(null);
  const active = useRef(false);
  return async <T extends object, R>(
    input: T,
    send: (payload: T & { requestId: string }) => Promise<R>,
  ): Promise<R> => {
    if (active.current) throw new Error('Your request is already sending.');
    active.current = true;
    const userId = session?.user.id;
    const assertOwner = () => {
      if (!alive.current || owner.current !== userId) {
        throw new Error('Your account changed. Open Support again to continue.');
      }
    };
    try {
      if (!session?.user.id) {
        throw new Error('Sign in before sending a support request.');
      }
      const signature = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        JSON.stringify([session.user.id, input]),
      );
      const storageKey = `kivelli:support-request:${session.user.id}:${
        'ticketId' in input
          ? String(input.ticketId) +
            ('recoveryAction' in input ? ':' + String(input.recoveryAction) : ':reply')
          : 'new'
      }`;
      if (pending.current?.signature !== signature) {
        let saved: { signature: string; requestId: string } | null = null;
        try {
          saved = JSON.parse(await AsyncStorage.getItem(storageKey) ?? 'null');
        } catch { /* Session-only deduplication remains available. */ }
        pending.current = saved?.signature === signature && typeof saved.requestId === 'string'
          ? saved
          : { signature, requestId: createClientRequestId() };
      }
      await AsyncStorage.setItem(storageKey, JSON.stringify(pending.current))
        .catch(() => {});
      assertOwner();
      const result = await send({
        ...input,
        requestId: pending.current.requestId,
        expectedUserId: userId,
      });
      assertOwner();
      pending.current = null;
      await AsyncStorage.removeItem(storageKey).catch(() => {});
      return result;
    } finally {
      active.current = false;
    }
  };
}
