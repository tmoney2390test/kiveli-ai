import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createProposalDecisionGuard, reactToSavedProposal } from './proposalDecision';

describe('proposal decisions during dialogue', () => {
  it.each(['Do it', 'Not now'])('can save %s without waiting for the typing reply', async () => {
    const guard = createProposalDecisionGuard();
    const save = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue(undefined);

    expect(guard.begin('proposal')).toBe(true);
    await save();
    await reactToSavedProposal(() => true, react);
    guard.finish('proposal', true);

    expect(save).toHaveBeenCalledOnce();
    expect(react).not.toHaveBeenCalled();
    expect(guard.isHidden('proposal')).toBe(true);
  });

  it('blocks rapid duplicate and conflicting taps before a React render', () => {
    const guard = createProposalDecisionGuard();
    expect(guard.begin('proposal')).toBe(true);
    expect(guard.begin('proposal')).toBe(false);
    expect(guard.begin('another')).toBe(false);
    expect(guard.isHidden('proposal')).toBe(true);
  });

  it('keeps an answered card hidden if a delayed refresh returns it', () => {
    const guard = createProposalDecisionGuard();
    guard.begin('proposal');
    guard.finish('proposal', true);
    expect(guard.isHidden('proposal')).toBe(true);
    expect(guard.begin('proposal')).toBe(false);
    expect(guard.begin('new-proposal')).toBe(true);
  });

  it('allows retry after a failed save without unlocking a different request', () => {
    const guard = createProposalDecisionGuard();
    guard.begin('proposal');
    guard.finish('other', false);
    expect(guard.begin('other')).toBe(false);
    guard.finish('proposal', false);
    expect(guard.isHidden('proposal')).toBe(false);
    expect(guard.begin('proposal')).toBe(true);
  });

  it('keeps handled decisions scoped to their chat', () => {
    const first = createProposalDecisionGuard(), second = createProposalDecisionGuard();
    first.begin('proposal');
    first.finish('proposal', true);
    expect(second.isHidden('proposal')).toBe(false);
    expect(second.begin('proposal')).toBe(true);
  });

  it('uses live typing state after the proposal network request', async () => {
    let typing = false;
    const isReplyPending = () => typing;
    const react = vi.fn().mockResolvedValue(undefined);
    const save = vi.fn(() => { typing = true; return Promise.resolve(); });
    await save();
    await reactToSavedProposal(isReplyPending, react);
    expect(react).not.toHaveBeenCalled();
  });

  it('still generates a scene reaction when the chat is idle', async () => {
    const react = vi.fn().mockResolvedValue(undefined);
    await reactToSavedProposal(() => false, react);
    expect(react).toHaveBeenCalledOnce();
  });

  it('does not undo the saved choice when an optional reaction fails', async () => {
    const guard = createProposalDecisionGuard();
    guard.begin('proposal');
    try {
      await reactToSavedProposal(() => false, () => Promise.reject(new Error('offline')));
    } catch {
      // The action was already saved successfully, independently of its reply.
    } finally {
      guard.finish('proposal', true);
    }
    expect(guard.isHidden('proposal')).toBe(true);
  });

  it('wires both buttons independently of typing, retaining live stream and duplicate guards', () => {
    const source = readFileSync(new URL('../../app/chat.tsx', import.meta.url), 'utf8');
    const handlers = source.slice(source.indexOf('const acceptCharacterProposal='), source.indexOf('const moveScene ='));
    expect(handlers).not.toContain('||replyPending');
    expect(handlers.match(/!proposalDecisions.begin\(proposal.actionId\)/g)).toHaveLength(2);
    expect(handlers).toContain('reactToSavedProposal(isSceneReplyPending');
    expect(handlers).not.toContain('setStream(');
    expect(handlers.indexOf('proposalDecisions.finish')).toBeLessThan(handlers.indexOf('await reactToSavedProposal'));
    expect(source).toContain('proposal={characterProposal} busy={interactionLoading}');
    expect(source).toContain('!proposalDecisions.isHidden(characterProposal.actionId)');
    expect(source).toContain('replyPendingRef.current||sendInFlightRef.current||Boolean(useTogether.getState().pendingDialogues[conversation.id])');
    expect(source).toContain('generateSceneReaction=async(actionId:string)=>{if(isSceneReplyPending())return');
    expect(source).toContain('if(!contextAuthorization||isSceneReplyPending())return;');
  });
});
