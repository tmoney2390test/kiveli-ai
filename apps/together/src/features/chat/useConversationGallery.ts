import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { loadConversationMediaGallery } from '../../lib/api/media';
import type { ConversationAttachment, GeneratedMedia } from '../../types';
import type { ChatRequestScope } from './requestScope';
import { useScopedChatState } from './useScopedChatState';

const emptyGallery = {
  media: [] as GeneratedMedia[],
  attachments: [] as ConversationAttachment[],
  loading: false,
  error: '',
};

export function useConversationGallery(options: {
  scope: ChatRequestScope;
  conversationId?: string;
  visible: boolean;
  onMedia?: (media: GeneratedMedia) => void;
}) {
  const { scope, conversationId, visible } = options;
  const [state, setState] = useScopedChatState(scope, emptyGallery);
  const onMedia = useRef(options.onMedia);
  useLayoutEffect(() => {
    onMedia.current = options.onMedia;
  }, [options.onMedia]);
  const load = useCallback(async () => {
    if (!conversationId) return;
    const request = scope.start('gallery', true);
    if (!request) return;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await loadConversationMediaGallery(conversationId, 160);
      if (!request.isCurrent()) return;
      const media = result.media ?? [], attachments = result.attachments ?? [];
      setState({ media, attachments, loading: false, error: '' });
      for (const item of media) {
        if (item.metadata?.hiddenIntermediate !== true) onMedia.current?.(item);
      }
    } catch (caught) {
      if (request.isCurrent()) {
        setState((current) => ({
          ...current,
          loading: false,
          error: caught instanceof Error
            ? caught.message
            : 'Conversation media could not be loaded.',
        }));
      }
    } finally {
      request.release();
    }
  }, [conversationId, scope, setState]);
  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);
  return { ...state, load };
}
