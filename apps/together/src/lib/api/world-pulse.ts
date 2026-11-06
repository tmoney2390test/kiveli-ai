import type { AroundTownItem, WorldPulseEvent } from '@together/domain/src/world-pulse';
import type { WorldPulseV2Event } from '@together/domain/src/world-pulse-v2';
import type { Conversation, GroupDetail } from '../../types';
import { invoke } from './transport';
export type WorldPulseFeedResponse = {
  version?: 1;
  worldId: string | null;
  events: WorldPulseEvent[];
  items: AroundTownItem[];
  generatedAt: string;
} | {
  version: 2;
  worldId: string;
  serverNow: string;
  generatedAt: string;
  events: WorldPulseV2Event[];
};
export const loadWorldPulse = (worldId?: string) =>
  invoke<WorldPulseFeedResponse>(
    `together-world-pulse${worldId ? `?worldId=${encodeURIComponent(worldId)}` : ''}`,
    undefined,
    'GET',
  );
export const loadWorldPulseEvent = (eventId: string) =>
  invoke<{
    version: 2;
    serverNow: string;
    event: WorldPulseV2Event & {
      detailBody: string;
      userVisibleFacts: {
        id: string;
        text: string;
      }[];
      groupMessage: string | null;
      directMessages: Record<string, string>;
      allowedActions: {
        directCharacterTemplateIds: string[];
        group: boolean;
        groupLocked: boolean;
      };
    };
  }>(`together-world-pulse?eventId=${encodeURIComponent(eventId)}`, undefined, 'GET');
export const loadWorldPulseConversationLabel = (conversationId: string) =>
  invoke<{
    version: 2;
    serverNow: string;
    label: {
      eventId: string;
      title: string;
      occurredAt: string;
      fresh: boolean;
    } | null;
  }>(`together-world-pulse?conversationId=${encodeURIComponent(conversationId)}`, undefined, 'GET');
export const openDirectWorldPulse = (input: {
  occurrenceId: string;
  characterTemplateId: string;
  requestId: string;
}) =>
  invoke<{
    conversation: Conversation;
    characterInstanceId: string;
    characterHandle: string;
    draft: string;
    occurrenceId: string;
  }>('together-conversation', { action: 'open_from_world_pulse', ...input });
export const openGroupWorldPulse = (input: {
  occurrenceId: string;
  requestId: string;
}) =>
  invoke<
    GroupDetail & {
      draft: string;
    }
  >('together-group', { action: 'create_from_world_pulse', ...input });
