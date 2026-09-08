import type { SupabaseClient } from '@supabase/supabase-js';
import { chatSpeedEnabled } from './kivelle-chat-latency.ts';

const reads = new WeakMap<SupabaseClient, Map<string, Promise<unknown>>>();

/** Preserve the pooled transport while giving request-owned WeakMaps a unique key. */
export function requestClient(client: SupabaseClient): SupabaseClient {
  const scoped = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  reads.set(scoped, new Map());
  return scoped;
}

/** Only memoize reads explicitly known to be stable during this request. */
export async function requestRead<T>(db: SupabaseClient, key: readonly unknown[], loader: () => PromiseLike<T>): Promise<T> {
  const cache = chatSpeedEnabled('CONTEXT_REUSE') ? reads.get(db) : undefined;
  if (!cache) return await loader();
  const id = JSON.stringify(key);
  let pending = cache.get(id) as Promise<T> | undefined;
  if (!pending) {
    pending = Promise.resolve().then(loader).catch((error) => { cache.delete(id); throw error; });
    cache.set(id, pending);
  }
  // Context builders enrich rows; never let one speaker mutate another's inputs.
  const result=await pending;
  if(result&&typeof result==='object'&&'error' in result&&result.error)cache.delete(id);
  return structuredClone(result);
}
