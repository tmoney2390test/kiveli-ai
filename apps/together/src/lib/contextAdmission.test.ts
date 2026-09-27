import { beforeEach, expect, it, vi } from 'vitest';
import { pricedCompanionPrompt } from '../../../../supabase/functions/_shared/kivelle-context-charge';
import { setContextReservation, contextReservation } from '../../../../supabase/functions/_shared/kivelle-context-pricing-state';
type SupabaseClient = Parameters<typeof setContextReservation>[0];
vi.mock('../../../../supabase/functions/_shared/kivelle-intelligence.ts', () => ({
  compileCompanionPrompt: (context: { contextInputCeiling?: number; small?: boolean }) => ({ prompt: context.contextInputCeiling && !context.small ? 'expanded' : 'included', estimatedTokens: context.contextInputCeiling && !context.small ? 24000 : 1000, ceilingTokens: context.contextInputCeiling ?? 8000 }),
}));
const rpc = vi.fn();
let db: SupabaseClient;
const input = () => ({ db, context: {}, speakerId: 'speaker', provider: 'openai', model: 'gpt-5.6-luna', maxOutputTokens: 1000 });
beforeEach(() => {
  rpc.mockReset(); rpc.mockResolvedValue({ error: null });
  db = { rpc } as unknown as SupabaseClient;
  setContextReservation(db, { quoteId: 'quote', requestId: 'request', userId: 'owner', conversationId: 'chat', preference: 'extended_32k', ceiling: 32000, maximumReplies: 3, replies: [], usedReplies: new Set(), automatic: true });
});
it('does not release a paid prompt to the provider before the wallet hold succeeds', async () => {
  let finish!: (value: unknown) => void;
  rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let ready = false;
  const pending = pricedCompanionPrompt(input()).then(value => { ready = true; return value; });
  await Promise.resolve(); expect(ready).toBe(false); expect(contextReservation(db)?.usedReplies.size).toBe(0);
  expect(rpc).toHaveBeenCalledWith('kivelle_prepare_context_reply', expect.objectContaining({ p_quote_id: 'quote', p_slot: expect.objectContaining({ provider: 'openai', model: 'gpt-5.6-luna', paidExpansion: true }) }));
  finish({ error: null }); const result = await pending;
  expect(result.prompt).toBe('expanded'); expect(result.payment?.slot.maximumCredits).toBeGreaterThan(0);
});
it('rejects insufficient funds without starting a paid reply or consuming a reply slot', async () => {
  rpc.mockResolvedValue({ error: { message: 'INSUFFICIENT_KIVELLE_CREDITS' } });
  await expect(pricedCompanionPrompt(input())).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  expect(contextReservation(db)?.usedReplies.size).toBe(0);
});
it('reserves zero for short conversations where expanded memory adds nothing', async () => {
  const result = await pricedCompanionPrompt({ ...input(), context: { small: true } });
  expect(result.prompt).toBe('included'); expect(result.payment?.slot.maximumCredits).toBe(0);
});
it('retains the reply identity on a provider retry and bounds new replies', async () => {
  contextReservation(db)!.maximumReplies = 1;
  const first = await pricedCompanionPrompt(input());
  const retry = await pricedCompanionPrompt({ ...input(), payment: first.payment });
  expect(retry.payment?.replyKey).toBe(first.payment?.replyKey);
  await expect(pricedCompanionPrompt(input())).rejects.toThrow('new context price');
});
it('does not admit an unpriced model', async () => {
  await expect(pricedCompanionPrompt({ ...input(), model: 'unknown' })).rejects.toThrow('pricing is being updated');
  expect(rpc).not.toHaveBeenCalled();
});
