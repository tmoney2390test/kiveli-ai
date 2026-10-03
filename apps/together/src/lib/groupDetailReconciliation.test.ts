import { describe, expect, it } from "vitest";
import type { GroupDetail, GroupDetailDelta, GroupTimelinePage } from "../types";
import {
  applyGroupDetailDelta,
  mergeGroupDetailRefresh,
  prependGroupTimelinePage,
} from "./groupDetailReconciliation";

const base = {
  conversation: { id: "c" },
  participants: [],
  messages: [{ id: "m2", created_at: "2026-01-02" }],
  reactions: [],
  generatedMedia: [{
    id: "p",
    created_at: "2026-01-02",
    status: "generating",
    signed_url: null,
  }],
  mediaOffers: [],
  sharedPlans: [],
  conversationActions: [],
  conversationEvents: [],
  settings: { responseMode: "automatic", energy: "balanced", notificationMode: "all" },
  hasMoreMessages: true,
  syncedAt: "2026-01-02",
} as unknown as GroupDetail;

describe("group detail reconciliation", () => {
  it('preserves older-page media and pagination when a resume read only returns recent messages', () => {
    const older = { ...base.messages[0]!, id: 'm1', created_at: '2026-01-01' };
    const oldPhoto = { ...base.generatedMedia[0]!, message_id: 'm1', status: 'ready', signed_url: 'older-photo' } as GroupDetail['generatedMedia'][number];
    const oldReaction = { id: 'r1', message_id: 'm1', created_at: '2026-01-01' } as GroupDetail['reactions'][number];
    const current = { ...base, messages: [older, ...base.messages], generatedMedia: [oldPhoto], reactions: [oldReaction], hasMoreMessages: false };
    const incoming = { ...base, generatedMedia: [], hasMoreMessages: true, syncedAt: '2026-01-03' };
    const next = mergeGroupDetailRefresh(current, incoming);
    expect(next.messages.map(message => message.id)).toEqual(['m1', 'm2']);
    expect(next.generatedMedia).toEqual([oldPhoto]);
    expect(next.reactions).toEqual([oldReaction]);
    expect(next.hasMoreMessages).toBe(false);
  });

  it('honors authoritative removals within the refreshed window and resolved actions', () => {
    const current = { ...base,
      generatedMedia: [{ ...base.generatedMedia[0]!, message_id: 'm2', status: 'ready', signed_url: 'removed' }],
      reactions: [{ id: 'reaction', message_id: 'm2' }],
      mediaOffers: [{ id: 'offer', message_id: 'm2' }],
      conversationActions: [{ id: 'dismissed-action', status: 'pending' }],
    } as GroupDetail;
    const incoming = { ...base, generatedMedia: [], hasMoreMessages: false, syncedAt: '2026-01-03' };
    const next = mergeGroupDetailRefresh(current, incoming);
    expect(next.generatedMedia).toEqual([]);
    expect(next.reactions).toEqual([]);
    expect(next.mediaOffers).toEqual([]);
    expect(next.conversationActions).toEqual([]);
    expect(next.hasMoreMessages).toBe(false);
  });

  it('does not retain assets for missing messages inside the refreshed time window', () => {
    const current = { ...base, messages: [...base.messages, { ...base.messages[0]!, id: 'm3', created_at: '2026-01-03' }],
      generatedMedia: [{ ...base.generatedMedia[0]!, message_id: 'm3' }] };
    const incoming = { ...base, generatedMedia: [], syncedAt: '2026-01-04' };
    expect(mergeGroupDetailRefresh(current, incoming).generatedMedia).toEqual([]);
  });

  it('uses server pagination for a summary-only shell or a different conversation', () => {
    const shell = { ...base, messages: [], hasMoreMessages: false };
    expect(mergeGroupDetailRefresh(shell, base).hasMoreMessages).toBe(true);
    const other = { ...base, conversation: { ...base.conversation, id: 'other' } };
    expect(mergeGroupDetailRefresh(other, base)).toBe(base);
  });

  it('keeps a non-overlapping latest page pageable instead of hiding a gap after a long absence', () => {
    const pending = { ...base.messages[0]!, id: 'local-pending', created_at: '2026-01-04' };
    const current = { ...base, messages: [...base.messages, pending], hasMoreMessages: false };
    const incoming = { ...base, messages: [{ ...base.messages[0]!, id: 'm90', created_at: '2026-01-03' }], syncedAt: '2026-01-04', hasMoreMessages: true };
    const result = mergeGroupDetailRefresh(current, incoming);
    expect(result.messages.map(message => message.id)).toEqual(['m90', 'local-pending']);
    expect(result.hasMoreMessages).toBe(true);
  });

  it('rejects stale full reads and deltas without rolling back the sync cursor', () => {
    const newer = { ...base, syncedAt: '2026-01-04', conversation: { ...base.conversation, title: 'Current' } };
    expect(mergeGroupDetailRefresh(newer, base)).toBe(newer);
    expect(applyGroupDetailDelta(newer, base as GroupDetailDelta)).toBe(newer);
    expect(applyGroupDetailDelta(newer, { ...base, conversation: { ...base.conversation, id: 'other' } } as GroupDetailDelta)).toBe(newer);
  });

  it('removes a recovered optimistic row while keeping newer messages', () => {
    const optimistic = { ...base.messages[0]!, id: 'local-pending', created_at: '2026-01-03' };
    const newest = { ...base.messages[0]!, id: 'streamed', created_at: '2026-01-04' };
    const current = { ...base, messages: [...base.messages, optimistic, newest] };
    expect(mergeGroupDetailRefresh(current, { ...base, syncedAt: '2026-01-05' }, [optimistic.id]).messages.map(message => message.id)).toEqual(['m2', 'streamed']);
  });
  it("merges realtime deltas without replacing the loaded timeline", () => {
    const delta = {
      conversation: { id: "c", title: "Friends" },
      messages: [{ id: "m3", created_at: "2026-01-03" }],
      reactions: [],
      generatedMedia: [{
        id: "p",
        created_at: "2026-01-02",
        status: "ready",
        signed_url: "signed",
      }],
      mediaOffers: [],
      sharedPlans: [],
      conversationActions: [],
      conversationEvents: [],
      syncedAt: "2026-01-03",
    } as unknown as GroupDetailDelta;
    const next = applyGroupDetailDelta(base, delta);
    expect(next.messages.map((item) => item.id)).toEqual(["m2", "m3"]);
    expect(next.generatedMedia[0]?.status).toBe("ready");
    expect(next.conversation.title).toBe("Friends");
  });

  it("prepends an older page and preserves newer messages", () => {
    const page = {
      messages: [{ id: "m1", created_at: "2026-01-01" }],
      reactions: [],
      generatedMedia: [],
      mediaOffers: [],
      hasMore: false,
    } as unknown as GroupTimelinePage;
    const next = prependGroupTimelinePage(base, page);
    expect(next.messages.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(next.hasMoreMessages).toBe(false);
  });
});
