import { useLayoutEffect, useMemo } from 'react';
import { createChatRequestScope } from './requestScope';

export function useChatRequestScope(userId?: string, lifeId?: string, conversationId?: string) {
  const key = JSON.stringify([userId, lifeId, conversationId]);
  const scope = useMemo(() => createChatRequestScope(), [key]);
  useLayoutEffect(() => {
    scope.activate();
    return () => scope.dispose();
  }, [scope]);
  return scope;
}
