import type {
  CharacterInteractionProposal,
  InteractionCandidate,
  SceneAction,
  SceneSession,
} from '../../types';
import { withIdempotentRetry } from '../requestRetry';
import { invoke } from './transport';
export const manageScenario = <T = unknown>(input: Record<string, unknown>): Promise<T> =>
  withIdempotentRetry(() => invoke<T>('together-scenario', input));
export const mutateDate = <T>(input: Record<string, unknown>) => invoke<T>('together-date', input);
export const managePlan = <T>(input: Record<string, unknown>) => invoke<T>('together-plan', input);
export const createSharedPlan = <T>(input: {
  activityKey?: string;
  activity?: string;
  locationId: string;
  characterInstanceId: string;
  startsAt?: string;
  scheduledFor?: string;
  timingChoice?: 'now' | 'in_one_hour' | 'custom';
  requestId: string;
  note?: string;
  source?: 'chat' | 'manual_planner' | 'location' | 'discover' | 'date' | 'story';
  sourceConversationId?: string;
}) =>
  invoke<T>('together-plan', {
    action: 'create',
    activityKey: input.activityKey ?? input.activity,
    locationId: input.locationId,
    characterInstanceId: input.characterInstanceId,
    startsAt: input.startsAt ?? input.scheduledFor,
    timingChoice: input.timingChoice,
    requestId: input.requestId,
    note: input.note,
    source: input.source ?? 'manual_planner',
    sourceConversationId: input.sourceConversationId,
  });
export const cancelSharedPlan = <T>(planId: string, conversationId?: string) =>
  invoke<T>('together-plan', { action: 'cancel', planId, conversationId });
export const confirmConversationAction = <T>(candidateId: string, input?: {
  startsAt?: string;
  scheduledFor?: string;
  timingChoice?: 'now' | 'in_one_hour' | 'custom';
  windowStartsAt?: string;
  windowEndsAt?: string;
  timePrecision?: 'exact' | 'approximate' | 'daypart' | 'window' | 'day';
  originalTimeExpression?: string;
  activityKey?: string;
  activity?: string;
  locationId?: string;
  planId?: string;
}) =>
  invoke<T>('together-plan', {
    action: 'confirm_proposal',
    candidateId,
    startsAt: input?.startsAt ?? input?.scheduledFor,
    timingChoice: input?.timingChoice,
    windowStartsAt: input?.windowStartsAt,
    windowEndsAt: input?.windowEndsAt,
    timePrecision: input?.timePrecision,
    originalTimeExpression: input?.originalTimeExpression,
    activityKey: input?.activityKey ?? input?.activity,
    locationId: input?.locationId,
    planId: input?.planId,
  });
export const dismissConversationAction = <T>(candidateId: string) =>
  invoke<T>('together-plan', { action: 'dismiss_proposal', candidateId });
export const manageInteraction = <
  T = {
    scene: SceneSession;
    action?: SceneAction;
    interactions: InteractionCandidate[];
    destinations: InteractionCandidate[];
    characterProposal?: CharacterInteractionProposal;
  },
>(input: Record<string, unknown>) =>
  typeof input.requestId === 'string'
    ? withIdempotentRetry(() => invoke<T>('together-interaction', input), {
      attempts: 2,
      delayMs: 180,
    })
    : invoke<T>('together-interaction', input);
export const enterScene = <T>(input: {
  characterInstanceId: string;
  locationId: string;
  conversationId?: string;
}) => invoke<T>('together-conversation', { action: 'enter_scene', ...input });
export const manageSharedScene = <T>(input: Record<string, unknown>) =>
  invoke<T>('together-shared-scene', input);
