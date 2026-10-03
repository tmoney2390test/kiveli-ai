import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';
import type { ChatRequestScope } from './requestScope';

/** A route change hides the previous session's state in the very first render. */
export function useScopedChatState<T>(
  scope: ChatRequestScope,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [stored, setStored] = useState({ scope, value: initial });
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    const isCurrent = scope.capture();
    if (!isCurrent()) return;
    setStored((previous) => {
      if (!isCurrent()) return previous;
      const value = previous.scope === scope ? previous.value : initial;
      return {
        scope,
        value: typeof update === 'function' ? (update as (value: T) => T)(value) : update,
      };
    });
  }, [scope, initial]);
  return [stored.scope === scope ? stored.value : initial, setValue];
}
