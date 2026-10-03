import type { Snapshot } from '../../types';
import { withIdempotentRetry } from '../requestRetry';
import { coalesceSimulationRequest } from '../simulationRequests';
import { invoke } from './transport';
export const setActiveCompanion = (
  characterInstanceId: string,
  source: 'home_switcher' | 'discover_profile' | 'companion_manager' = 'home_switcher',
) => invoke<Snapshot>('together-companion', { action: 'set_active', characterInstanceId, source });
export const meetCompanion = (
  characterTemplateId: string,
  source: 'onboarding' | 'discover_profile' | 'group_invite' = 'discover_profile',
) =>
  withIdempotentRetry(
    () => invoke<Snapshot>('together-companion', { action: 'meet', characterTemplateId, source }),
    { attempts: 2, delayMs: 220 },
  );
export const setCharacterFavorite = (
  characterTemplateId: string,
  favorite: boolean,
  source: 'home_featured' | 'discover' | 'chat_menu' = 'home_featured',
) =>
  invoke<{
    characterTemplateId: string;
    favorite: boolean;
    favoriteCharacterTemplateIds: string[];
  }>('together-companion', { action: 'set_favorite', characterTemplateId, favorite, source });
export const simulate = (characterInstanceId?: string) =>
  coalesceSimulationRequest(
    characterInstanceId ?? 'active',
    () => invoke('together-simulate', { characterInstanceId, evaluateProactive: true }),
  );
export const markProactiveOpened = (proactiveMessageId: string) =>
  invoke('together-notifications', { action: 'opened', proactiveMessageId });
export const introduction = <T>(action: 'preview' | 'accept' | 'complete', choice?: string) =>
  invoke<T>('together-introduction', { action, choice });
export const resolveRelationshipMilestone = (
  milestoneId: string,
  action: 'accept' | 'defer' | 'stay_friends' | 'talk_it_out' | 'give_space',
) =>
  invoke<{
    snapshot: Snapshot;
  }>('together-relationship', { milestoneId, action });
