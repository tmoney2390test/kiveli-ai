import type {
  CreatorDraft,
  CreatorIdentityConfig,
  CreatorLifeConfig,
  CreatorRoutineBlock,
  CreatorStep,
} from '../../types';
import { invoke } from './transport';
export const manageCreator = <T>(input: Record<string, unknown>) =>
  invoke<T>('together-creator', input);
export const createCreatorDraft = (input: {
  concept: string;
  worldId: string;
  relationshipGoal: 'friendship' | 'romance' | 'either';
  requestId: string;
  identitySeed?: {
    name: string;
    age: number;
    gender: string;
    pronouns: string;
    description?: string;
  };
}) =>
  manageCreator<{
    draft: CreatorDraft;
    idempotent: boolean;
  }>({ action: 'create_draft', ...input });
export const getCreatorDraft = (draftId: string) =>
  manageCreator<{
    draft: CreatorDraft;
  }>({ action: 'get_draft', draftId });
export const listCreatorDrafts = () =>
  manageCreator<{
    drafts: CreatorDraft[];
  }>({ action: 'list_drafts' });
export const updateCreatorDraftSection = (input: {
  draftId: string;
  section:
    | 'identity'
    | 'appearance'
    | 'personality'
    | 'communication'
    | 'connection'
    | 'life'
    | 'routine';
  config: Record<string, unknown>;
  expectedRevision: number;
  currentStep?: CreatorStep;
  relationshipGoal?: 'friendship' | 'romance' | 'either';
}) =>
  manageCreator<{
    draft: CreatorDraft;
    readiness?: {
      ready: boolean;
      missing: string[];
    };
  }>({ action: 'update_draft_section', ...input });
export const updateCreatorDraftSections = (input: {
  draftId: string;
  sections: Partial<
    Record<
      | 'identity'
      | 'appearance'
      | 'personality'
      | 'communication'
      | 'connection'
      | 'life'
      | 'routine',
      Record<string, unknown>
    >
  >;
  expectedRevision: number;
  currentStep?: CreatorStep;
  relationshipGoal?: 'friendship' | 'romance' | 'either';
}) =>
  manageCreator<{
    draft: CreatorDraft;
    readiness?: {
      ready: boolean;
      missing: string[];
    };
  }>({ action: 'update_draft_sections', ...input });
export const regenerateCreatorDraftSection = (
  draftId: string,
  section: 'routine' | 'first_meetings',
) =>
  manageCreator<{
    draft: CreatorDraft;
  }>({ action: 'regenerate_draft_section', draftId, section });
export const generateCreatorAppearance = (draftId: string, requestId: string) =>
  manageCreator<{
    draft: CreatorDraft;
    creditCost?: number;
    creditBalance?: {
      permanentBalance: number;
      subscriptionBalance: number;
      total: number;
    };
  }>({ action: 'generate_draft_appearance', draftId, requestId });
export const selectCreatorAppearance = (draftId: string, assetId: string) =>
  manageCreator<{
    draft: CreatorDraft;
    readiness?: {
      ready: boolean;
      missing: string[];
    };
  }>({ action: 'select_draft_appearance', draftId, assetId });
export const authorizeCreatorAppearanceUpload = (input: {
  draftId: string;
  requestId: string;
  byteSize: number;
  width: number;
  height: number;
  description: string;
  referenceOrigin: 'fictional_ai' | 'authorized_real_person';
}) =>
  manageCreator<{
    assetId: string;
    path: string;
    token: string;
  }>({ action: 'authorize_draft_appearance_upload', ...input, contentType: 'image/jpeg' });
export const completeCreatorAppearanceUpload = (input: {
  draftId: string;
  assetId: string;
  requestId: string;
}) =>
  manageCreator<{
    draft: CreatorDraft;
    readiness?: {
      ready: boolean;
      missing: string[];
    };
  }>({ action: 'complete_draft_appearance_upload', ...input });
export const cancelCreatorAppearanceUpload = (input: {
  draftId: string;
  assetId: string;
  requestId: string;
}) =>
  manageCreator<{
    cancelled: boolean;
  }>({ action: 'cancel_draft_appearance_upload', ...input });
export const selectCreatorFirstMeeting = (draftId: string, meetingId: string) =>
  manageCreator<{
    draft: CreatorDraft;
    readiness?: {
      ready: boolean;
      missing: string[];
    };
  }>({ action: 'select_first_meeting', draftId, meetingId });
export const finalizeCreatorDraft = (draftId: string, requestId: string) =>
  manageCreator<{
    draft: CreatorDraft;
    result?: {
      draftId: string;
      characterTemplateId: string;
      characterVersionId?: string;
      publicHandle?: string;
      idempotent: boolean;
    };
    finalized?: boolean;
  }>({ action: 'finalize_draft', draftId, requestId });
export const archiveCreatorDraft = (draftId: string) =>
  manageCreator<{
    archived: boolean;
    draftId: string;
  }>({ action: 'archive_draft', draftId });
export const previewCreatorRoutine = (input: {
  draftId: string;
  weekIndex: number;
  identity: CreatorIdentityConfig;
  life: CreatorLifeConfig;
}) =>
  manageCreator<{
    blocks: CreatorRoutineBlock[];
    source: string;
    notice?: string;
  }>({ action: 'preview_routine', ...input });
