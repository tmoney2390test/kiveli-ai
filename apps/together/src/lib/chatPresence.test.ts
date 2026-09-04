import{describe,expect,it}from'vitest';
import{CHAT_PRESENCE_FALLBACK_REFRESH_MS,nextChatPresenceTickDelay}from'./chatPresence';

describe('live chat presence timing',()=>{
  it('ticks just after the next minute boundary',()=>{
    expect(nextChatPresenceTickDelay(12_345)).toBe(47_730);
    expect(nextChatPresenceTickDelay(59_950)).toBe(125);
  });
  it('uses realtime as primary with a restrained fallback refresh',()=>{
    expect(CHAT_PRESENCE_FALLBACK_REFRESH_MS).toBe(120_000);
  });
  it('fails safely when the clock value is invalid',()=>{
    expect(nextChatPresenceTickDelay(Number.NaN)).toBe(1_000);
  });
});
