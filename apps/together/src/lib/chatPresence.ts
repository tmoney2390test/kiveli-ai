export const CHAT_PRESENCE_FALLBACK_REFRESH_MS=2*60_000;

/** Re-render just after the next clock minute so authored schedule boundaries
 * update the active place without reloading the conversation. */
export function nextChatPresenceTickDelay(nowMs:number):number{
  if(!Number.isFinite(nowMs))return 1_000;
  return Math.max(100,60_000-(Math.floor(nowMs)%60_000)+75);
}
