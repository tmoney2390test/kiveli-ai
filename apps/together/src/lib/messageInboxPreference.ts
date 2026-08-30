import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InboxFilter } from "./messageInbox";

const PREFIX = "kivelle:message-inbox-filter:v1";
const FILTERS = new Set<InboxFilter>(["all", "unread", "favorites", "groups"]);

export function messageInboxFilterKey(userId: string, continuityId: string): string {
  return `${PREFIX}:${userId}:${continuityId}`;
}

export function normalizeInboxFilter(value: string | null | undefined): InboxFilter {
  return value && FILTERS.has(value as InboxFilter) ? value as InboxFilter : "all";
}

export async function loadInboxFilter(
  userId: string,
  continuityId: string,
): Promise<InboxFilter> {
  if (!userId || !continuityId) return "all";
  try {
    return normalizeInboxFilter(
      await AsyncStorage.getItem(messageInboxFilterKey(userId, continuityId)),
    );
  } catch {
    return "all";
  }
}

export async function saveInboxFilter(
  userId: string,
  continuityId: string,
  filter: InboxFilter,
): Promise<void> {
  if (!userId || !continuityId) return;
  try {
    await AsyncStorage.setItem(messageInboxFilterKey(userId, continuityId), filter);
  } catch {
    // A storage failure should never make the inbox unusable.
  }
}
