import AsyncStorage from '@react-native-async-storage/async-storage';

const confirmed = new Map<string, string>();
const key = (userId: string, conversationId: string) => `kivelle.context-cost-confirmation.v1:${userId}:${conversationId}`;

export async function contextCostConfirmed(userId: string, conversationId: string, token: string): Promise<boolean> {
  if (!userId || !conversationId) return false;
  const storageKey = key(userId, conversationId);
  if (confirmed.get(storageKey) === token) return true;
  try { return await AsyncStorage.getItem(storageKey) === token; } catch { return false; }
}

export async function confirmContextCost(userId: string, conversationId: string, token: string): Promise<void> {
  if (!userId || !conversationId) return;
  const storageKey = key(userId, conversationId);
  if (confirmed.size >= 100) confirmed.delete(confirmed.keys().next().value!);
  confirmed.set(storageKey, token);
  try { await AsyncStorage.setItem(storageKey, token); } catch { /* Keep the confirmed choice for this session. */ }
}
