import type { Message } from '../types';

export type ConversationMessagePage = { messages: Message[]; hasMore: boolean };
type CachedConversationMessagePage = ConversationMessagePage & { loadedAt: number };
type MessagePageLoader = () => Promise<ConversationMessagePage>;

const MAX_CACHED_CONVERSATIONS = 5;
const MAX_CACHED_MESSAGES = 150;
const FRESH_WARMUP_MS = 15_000;
const cacheByUser = new Map<string, Map<string, CachedConversationMessagePage>>();
const inFlightByScope = new Map<string, Promise<ConversationMessagePage>>();

function userCache(userId: string): Map<string, CachedConversationMessagePage> {
  const existing = cacheByUser.get(userId);
  if (existing) return existing;
  const created = new Map<string, CachedConversationMessagePage>();
  cacheByUser.set(userId, created);
  return created;
}

export function readConversationMessagePage(userId: string, conversationId: string): CachedConversationMessagePage | null {
  const cache = cacheByUser.get(userId);
  const entry = cache?.get(conversationId);
  if (!cache || !entry) return null;
  cache.delete(conversationId);
  cache.set(conversationId, entry);
  return entry;
}

export function writeConversationMessagePage(
  userId: string,
  conversationId: string,
  page: ConversationMessagePage,
  loadedAt = Date.now(),
): CachedConversationMessagePage {
  const cache = userCache(userId);
  const scopedMessages = page.messages.filter((message) => message.conversation_id === conversationId);
  const entry = {
    messages: scopedMessages.slice(-MAX_CACHED_MESSAGES),
    hasMore: page.hasMore || scopedMessages.length > MAX_CACHED_MESSAGES,
    loadedAt,
  };
  cache.delete(conversationId);
  cache.set(conversationId, entry);
  while (cache.size > MAX_CACHED_CONVERSATIONS) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return entry;
}

export function loadConversationMessagePage(
  userId: string,
  conversationId: string,
  loader: MessagePageLoader,
  options: { maxAgeMs?: number } = {},
): Promise<ConversationMessagePage> {
  const maxAgeMs = options.maxAgeMs ?? FRESH_WARMUP_MS;
  const cached = readConversationMessagePage(userId, conversationId);
  if (cached && Date.now() - cached.loadedAt <= maxAgeMs) return Promise.resolve(cached);
  const scope = `${userId}:${conversationId}`;
  const existing = inFlightByScope.get(scope);
  if (existing) return existing;
  const request = loader()
    .then((result) => writeConversationMessagePage(userId, conversationId, {
      messages: [...result.messages].reverse(),
      hasMore: result.hasMore,
    }))
    .finally(() => inFlightByScope.delete(scope));
  inFlightByScope.set(scope, request);
  return request;
}

export function prefetchConversationMessagePage(userId: string | undefined, conversationId: string, loader: MessagePageLoader): void {
  if (!userId || !conversationId) return;
  void loadConversationMessagePage(userId, conversationId, loader).catch(() => undefined);
}

export function resetConversationMessageWarmupForTests(): void {
  cacheByUser.clear();
  inFlightByScope.clear();
}
