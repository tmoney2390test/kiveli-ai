import type { ConversationAction, ConversationEvent, Message } from '../../types';
import {
  type SceneActionTimelineEntry,
  sceneActionTimelineEntryFromMessage,
} from '../../lib/interactionPresentation';
import { collapsePlanTimelineEvents } from '../../lib/planActions';
import { wasUnreadWhenChatOpened } from '../../lib/chatUnreadWindow';
export function mergeChatTimeline(
  messages: Message[],
  actions: ConversationAction[],
  events: ConversationEvent[],
  lastReadAt?: string | null,
  openedAt?: string | null,
  observedMessageIds: ReadonlySet<string> = new Set(),
  pendingSceneAction:
    | (SceneActionTimelineEntry & {
      createdAt: string;
    })
    | null = null,
) {
  events = collapsePlanTimelineEvents(events);
  const resolvedActionIds = new Set(
      events.filter((event) =>
        event.event_type === 'plan_proposed' && event.metadata.resolution !== 'pending'
      ).map((event) => event.entity_id),
    ),
    messageTimes = new Map(messages.map((message) => [message.id, message.created_at]));
  const callGroups = new Map<string, Message[]>();
  for (const message of messages) {
    const callId = typeof message.provider_metadata?.callSessionId === 'string'
      ? message.provider_metadata.callSessionId
      : null;
    if (callId) {
      callGroups.set(callId, [...(callGroups.get(callId) ?? []), message]);
    }
  }
  const callMessageIds = new Set([...callGroups.values()].flat().map((message) => message.id));
  const callEvents = new Map(
      events.filter((event) => event.event_type === 'voice_call').map((
        event,
      ) => [event.entity_id, event]),
    ),
    callIds = new Set([...callGroups.keys(), ...callEvents.keys()]);
  const voiceCalls = [...callIds].map((id) => {
    const ordered = [...(callGroups.get(id) ?? [])].sort((left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      ),
      event = callEvents.get(id),
      at = event?.created_at ?? ordered[0]?.created_at ?? new Date().toISOString(),
      durationMs = Math.max(
        0,
        Number(event?.metadata.durationMs ?? ordered[0]?.provider_metadata?.callDurationMs ?? 0),
      );
    return {
      kind: 'voice_call' as const,
      value: { id, messages: ordered, at, durationMs },
      at,
      sortOrder: 0,
    };
  });
  const visibleMessages = messages.filter((message) => !callMessageIds.has(message.id));
  const sceneActionDividers = visibleMessages.flatMap((message) => {
    const value = sceneActionTimelineEntryFromMessage(message);
    return value
      ? [{ kind: 'scene_action' as const, value, at: message.created_at, sortOrder: -1 }]
      : [];
  });
  if (
    pendingSceneAction &&
    !sceneActionDividers.some((item) => item.value.id === pendingSceneAction.id)
  ) {
    sceneActionDividers.push({
      kind: 'scene_action',
      value: pendingSceneAction,
      at: pendingSceneAction.createdAt,
      sortOrder: -1,
    });
  }
  const sorted = [
    ...sceneActionDividers,
    ...visibleMessages.map((value) => ({
      kind: 'message' as const,
      value,
      at: value.created_at,
      sortOrder: 0,
    })),
    ...voiceCalls,
    ...actions.filter((value) => !resolvedActionIds.has(value.id)).map((value) => ({
      kind: 'action' as const,
      value,
      at: value.assistant_message_id
        ? messageTimes.get(value.assistant_message_id) ?? value.created_at
        : value.created_at,
      sortOrder: 1,
    })),
    ...events.filter((value) =>
      value.event_type !== 'plan_proposed' && value.event_type !== 'voice_call'
    ).map((value) => ({ kind: 'event' as const, value, at: value.created_at, sortOrder: 2 })),
  ].sort((left, right) =>
    new Date(left.at).getTime() - new Date(right.at).getTime() || left.sortOrder - right.sortOrder
  );
  const result: Array<
    (typeof sorted)[number] | {
      kind: 'separator';
      key: string;
      label: string;
    }
  > = [];
  let day = '', unreadAdded = false;
  for (const item of sorted) {
    const itemDay = new Date(item.at).toDateString();
    if (itemDay !== day) {
      day = itemDay;
      result.push({
        kind: 'separator',
        key: `day-${item.at}`,
        label: timelineDayLabel(new Date(item.at)),
      });
    }
    const observed = item.kind === 'message' && observedMessageIds.has(item.value.id);
    if (
      !unreadAdded && !observed &&
      ((item.kind === 'message' && item.value.role === 'assistant') ||
        item.kind === 'voice_call') &&
      wasUnreadWhenChatOpened(item.at, { lastReadAt, openedAt })
    ) {
      unreadAdded = true;
      result.push({ kind: 'separator', key: `new-${item.at}`, label: 'NEW' });
    }
    result.push(item);
  }
  return result;
}
function timelineDayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return 'TODAY';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'YESTERDAY';
  }
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
}
