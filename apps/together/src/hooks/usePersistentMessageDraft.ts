import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { clearMessageDraft, loadMessageDraft, saveMessageDraft } from '../lib/messageDrafts';

type Input = { userId?: string; conversationId?: string; kind: 'direct' | 'group'; value: string; setValue: (value: string) => void; routeDraft?: string };
type DraftSession = { key: string; value: string; ready: boolean; edited: boolean; timer?: ReturnType<typeof setTimeout>; flush: () => void };
export function usePersistentMessageDraft(input: Input) {
  const session = useRef<DraftSession | null>(null), latest = useRef(input); latest.current = input;
  const key = `${input.userId ?? ''}:${input.kind}:${input.conversationId ?? ''}`;
  useEffect(() => {
    if (!input.userId || !input.conversationId) return;
    let cancelled = false;
    const { userId, conversationId, kind } = input;
    const state: DraftSession = { key, value: input.value, ready: false, edited: false, flush: () => {
      clearTimeout(state.timer);
      if (state.ready || state.edited) void saveMessageDraft(userId, conversationId, kind, state.value).catch(() => undefined);
    } };
    session.current = state;
    void loadMessageDraft(userId, conversationId, kind).catch(() => '').then(stored => {
      if (cancelled) return;
      if (!state.edited) {
        const value = input.routeDraft?.trim() ? input.routeDraft : state.value || stored;
        state.value = value; latest.current.setValue(value);
      }
      state.ready = true;
      state.flush();
    });
    const background = AppState.addEventListener('change', next => { if (next !== 'active') state.flush(); });
    if (Platform.OS === 'web') window.addEventListener('pagehide', state.flush);
    return () => { cancelled = true; state.flush(); background.remove(); if (Platform.OS === 'web') window.removeEventListener('pagehide', state.flush); if (session.current === state) session.current = null; };
  }, [key]);
  useEffect(() => {
    const state = session.current;
    if (!state || state.key !== key || state.value === input.value) return;
    state.value = input.value; state.edited = true;
    clearTimeout(state.timer);
    if (state.ready) state.timer = setTimeout(state.flush, 250);
  }, [input.value, key]);
  return useCallback(async () => {
    const state = session.current;
    if (state?.key === key) { clearTimeout(state.timer); state.value = ''; }
    if (input.userId && input.conversationId) await clearMessageDraft(input.userId, input.conversationId, input.kind);
  }, [key]);
}
