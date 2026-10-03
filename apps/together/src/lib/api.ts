/**
 * Compatibility exports for existing callers.
 * New code should import the owning module from ./api/<feature>.
 * Transport and feature implementations must never import this facade.
 */
export { ApiError, invoke } from './api/transport';
export { queueClientPerformance } from './api/telemetry';
export {
  bootstrap,
  confirmAdultAge,
  loadCharacterPresence,
  loadCharacterProfileDetails,
  loadCharacterSchedule,
  loadExploreCatalog,
  loadSnapshot,
} from './api/catalog';
export {
  introduction,
  markProactiveOpened,
  meetCompanion,
  resolveRelationshipMilestone,
  setActiveCompanion,
  setCharacterFavorite,
  simulate,
} from './api/companions';
export {
  archivePersonalPlace,
  confirmPersonalPlaceImage,
  createPersonalPlace,
  listPersonalPlaces,
  loadPlaceDetail,
  prepareNewPersonalPlaceImage,
  preparePersonalPlaceImage,
  updatePersonalPlace,
} from './api/places';
export {
  loadWorldPulse,
  loadWorldPulseConversationLabel,
  loadWorldPulseEvent,
  openDirectWorldPulse,
  openGroupWorldPulse,
  type WorldPulseFeedResponse,
} from './api/world-pulse';
export { getMemoryCenter, getMemoryHistory, mutateMemory, rememberMessage } from './api/memory';
export {
  cancelSharedPlan,
  confirmConversationAction,
  createSharedPlan,
  dismissConversationAction,
  enterScene,
  manageInteraction,
  managePlan,
  manageScenario,
  manageSharedScene,
  mutateDate,
} from './api/plans';
export {
  ensureConversation,
  manageConversation,
  openConversation,
  previewCharacterReset,
  setConversationPinned,
  setMessageFavorite,
  startOverCharacter,
} from './api/conversations';
export {
  animateMedia,
  createDirectVideo,
  editGeneratedMedia,
  enhanceVideoPrompt,
  getDirectVideoGenerationOptions,
  getVideoDiagnostics,
  getVideoGenerationOptions,
  loadConversationMediaGallery,
  loadMediaLibrary,
  loadPhotoOfferStatus,
  manageMedia,
  rateGeneratedMedia,
  recordVideoPlayback,
  submitVideoFeedback,
  trackVideoSelectorEvent,
  type VideoPromptEnhancementRequest,
  type VideoRequestSettings,
} from './api/media';
export {
  confirmUserImage,
  deleteConversationAttachment,
  getExperienceCapabilities,
  manageMultimodal,
  prepareUserImage,
  removePendingAttachment,
  saveMultimodalPreferences,
} from './api/multimodal';
export {
  manageCall,
  type ManageCallResult,
  previewCompanionVoice,
  quoteVoiceNote,
  refreshVoiceNote,
  requestVoiceNote,
  transcribeChatAudio,
  type VoiceCallBilling,
  type VoiceNoteQuote,
  type VoiceRouteOption,
} from './api/voice';
export {
  type GroupDialogueEvent,
  loadGroupDetail,
  manageGroup,
  sendGroupDialogue,
} from './api/groups';
export {
  archiveCreatorDraft,
  authorizeCreatorAppearanceUpload,
  cancelCreatorAppearanceUpload,
  completeCreatorAppearanceUpload,
  createCreatorDraft,
  finalizeCreatorDraft,
  generateCreatorAppearance,
  getCreatorDraft,
  listCreatorDrafts,
  manageCreator,
  previewCreatorRoutine,
  regenerateCreatorDraftSection,
  selectCreatorAppearance,
  selectCreatorFirstMeeting,
  updateCreatorDraftSection,
  updateCreatorDraftSections,
} from './api/creator';
export {
  createTogetherAccount,
  manageAccount,
  managePersona,
  manageSubscription,
  reportMessage,
} from './api/account';
export {
  quoteDialogueContext,
  rewriteDialogueMessage,
  sendDialogue,
  sendSceneReaction,
  suggestDialogue,
} from './api/dialogue';
