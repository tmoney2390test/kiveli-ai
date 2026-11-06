import type { AccountGender } from '@together/domain/src/account-onboarding';
import type {
  CharacterPresenceSnapshot,
  CharacterProfileDetails,
  ExploreCatalogSnapshot,
  ScheduleItem,
  Snapshot,
} from '../../types';
import { deviceTimezone, invoke } from './transport';
export const loadSnapshot = () => invoke<Snapshot>('together-bootstrap', undefined, 'GET');
export const loadIosExplicitDialogueStatus = () =>
  invoke<{ iosExplicitDialogueEnabled: boolean }>('together-bootstrap?scope=content_policy', undefined, 'GET');
export const loadExploreCatalog = () =>
  invoke<ExploreCatalogSnapshot>('together-bootstrap?scope=explore', undefined, 'GET');
export const confirmAdultAge = (input: {
  dateOfBirth: string;
  displayName: string;
  gender: AccountGender;
}) =>
  invoke<Snapshot>('together-bootstrap', { action: 'confirm_age', ageConfirmed: true, ...input });
export const loadCharacterPresence = (characterInstanceId: string) =>
  invoke<CharacterPresenceSnapshot>(
    `together-bootstrap?scope=presence&characterInstanceId=${
      encodeURIComponent(characterInstanceId)
    }`,
    undefined,
    'GET',
  );
export const loadCharacterSchedule = (characterTemplateId: string) =>
  invoke<{
    characterTemplateId: string;
    characterVersionId: string;
    schedules: ScheduleItem[];
  }>(
    `together-bootstrap?scope=character_schedule&characterTemplateId=${
      encodeURIComponent(characterTemplateId)
    }`,
    undefined,
    'GET',
  );
export const loadCharacterProfileDetails = (characterTemplateId: string, worldId?: string | null) =>
  invoke<CharacterProfileDetails>(
    `together-bootstrap?scope=character_profile&characterTemplateId=${
      encodeURIComponent(characterTemplateId)
    }${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ''}`,
    undefined,
    'GET',
  );
export const bootstrap = (input: {
  ageConfirmed: true;
  onboardingChoice?: 'companion' | 'skip';
  displayName?: string;
  characterTemplateId?: string;
  worldId?: string;
  interests: string[];
  goals: Array<'Dating' | 'Friendship' | 'Stories' | 'Social worlds'>;
}) =>
  invoke<Snapshot>('together-bootstrap', {
    action: 'complete_onboarding',
    ...input,
    experienceTimezone: deviceTimezone(),
  });
