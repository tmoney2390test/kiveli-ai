export type KivelleProviderCapability =
  | 'vision'
  | 'text_to_speech'
  | 'speech_to_text'
  | 'realtime_voice'
  | 'image_generation'
  | 'image_editing'
  | 'video_generation';

export type CapabilityStatus = 'available' | 'not_configured' | 'disabled' | 'temporarily_unavailable';

export type ProviderCapabilityState = Record<KivelleProviderCapability, CapabilityStatus>;

export type KivelleExperienceCapabilities = {
  userImageUploads: boolean;
  visionUnderstanding: boolean;
  voiceNotes: boolean;
  liveVoiceCalls: boolean;
  contextualSelfies: boolean;
  contextualVideos: boolean;
  multiCharacterScenes: boolean;
  providers: ProviderCapabilityState;
};

export type MultimodalPreferences = {
  userPhotoUploads?: boolean;
  companionVoiceNotes?: boolean;
  autoplayVoiceNotes?: boolean;
  liveVoiceCalls?: boolean;
  generatedPhotos?: boolean;
  generatedVideos?: boolean;
};

export type CompanionVoiceProfile = {
  characterTemplateId: string;
  voiceKey: string;
  characteristics: {
    warmth?: number;
    energy?: number;
    pace?: number;
    expressiveness?: number;
    softness?: number;
  };
  providerMappings?: Record<string, string>;
};

export type SceneSpeakerCandidate = {
  characterInstanceId: string;
  name: string;
  role: 'primary_companion' | 'participant' | 'guest';
  topicRelevance?: number;
  knowledgeRelevance?: number;
  socialEnergy?: number;
  directness?: number;
  socialAffinity?: number;
  socialTension?: number;
  relationshipType?: string;
  recentlyInterrupted?: boolean;
  lastSpoke?: boolean;
  available?: boolean;
};

export type SceneSpeakerSelection = {
  speakerInstanceIds: string[];
  addressedCharacterInstanceId?: string;
  groupAddressed: boolean;
  reasonCodes: string[];
};

export type RealtimeTranscriptEvent = {
  providerEventId?: string;
  speaker: 'user' | 'character';
  text: string;
  occurredAt?: string;
  final?: boolean;
};

export type CanonicalVoiceTranscriptEvent = {
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  occurredAt: string;
  final: boolean;
  providerEventId?: string;
};

const providerCapabilities: KivelleProviderCapability[] = [
  'vision', 'text_to_speech', 'speech_to_text', 'realtime_voice', 'image_generation', 'image_editing', 'video_generation',
];

export function capabilityStatus(input: { enabled?: boolean; provider?: string | null; credentialsPresent?: boolean; temporarilyUnavailable?: boolean }): CapabilityStatus {
  if (input.enabled === false) return 'disabled';
  if (input.temporarilyUnavailable) return 'temporarily_unavailable';
  if (!input.provider || input.provider === 'none' || !input.credentialsPresent) return 'not_configured';
  return 'available';
}

export function resolveExperienceCapabilities(input: {
  providerStatuses?: Partial<ProviderCapabilityState>;
  preferences?: MultimodalPreferences | null;
  product?: Partial<Omit<KivelleExperienceCapabilities, 'providers'>>;
} = {}): KivelleExperienceCapabilities {
  const providers = Object.fromEntries(providerCapabilities.map((key) => [key, input.providerStatuses?.[key] ?? 'not_configured'])) as ProviderCapabilityState;
  const preferences = input.preferences ?? {};
  const product = input.product ?? {};
  return {
    userImageUploads: product.userImageUploads !== false && preferences.userPhotoUploads !== false,
    visionUnderstanding: product.visionUnderstanding !== false && providers.vision === 'available',
    voiceNotes: product.voiceNotes !== false && preferences.companionVoiceNotes !== false,
    liveVoiceCalls: product.liveVoiceCalls !== false && preferences.liveVoiceCalls !== false,
    contextualSelfies: product.contextualSelfies !== false && preferences.generatedPhotos !== false,
    contextualVideos: product.contextualVideos !== false && preferences.generatedVideos !== false,
    multiCharacterScenes: product.multiCharacterScenes !== false,
    providers,
  };
}

export function validateUserImage(input: { mimeType: string; byteSize: number }, maxBytes = 10 * 1024 * 1024): { valid: true } | { valid: false; code: 'UNSUPPORTED_MEDIA_TYPE' | 'FILE_TOO_LARGE'; message: string } {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType.toLowerCase())) return { valid: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Choose a JPEG, PNG, or WebP image.' };
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0 || input.byteSize > maxBytes) return { valid: false, code: 'FILE_TOO_LARGE', message: 'Choose an image smaller than 10 MB.' };
  return { valid: true };
}

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/\b(\d{1,2}):(00)\s*(AM|PM)\b/gi, (_match, hour: string, _minutes: string, period: string) => `${hour} ${period.toLowerCase()}`)
    .replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (_match, hour: string, minutes: string, period: string) => `${hour} ${minutes} ${period.toLowerCase()}`)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes provider transcript events without creating a second conversation model. */
export function normalizeRealtimeTranscriptEvents(
  events: RealtimeTranscriptEvent[],
  fallbackOccurredAt: string,
): CanonicalVoiceTranscriptEvent[] {
  const providerIds = new Set<string>();
  return events.flatMap((event) => {
    if (event.final === false) return [];
    const content = event.text.replace(/\s+/g, ' ').trim().slice(0, 4_000);
    if (!content) return [];
    if (event.providerEventId && providerIds.has(event.providerEventId)) return [];
    if (event.providerEventId) providerIds.add(event.providerEventId);
    const parsedTime = event.occurredAt ? Date.parse(event.occurredAt) : Number.NaN;
    const normalized:CanonicalVoiceTranscriptEvent={
      sequence: 0,
      role: event.speaker === 'character' ? 'assistant' : 'user',
      content,
      occurredAt: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : fallbackOccurredAt,
      final: true,
      ...(event.providerEventId ? { providerEventId: event.providerEventId } : {}),
    };
    return [normalized];
  }).map((event,index)=>({...event,sequence:index+1}));
}

export function deriveCompanionVoiceProfile(input: {
  characterTemplateId: string;
  publicHandle?: string | null;
  slug?: string | null;
  personality?: Record<string, unknown>;
  communicationStyle?: Record<string, unknown>;
}): CompanionVoiceProfile {
  const personality = input.personality ?? {};
  const communication = input.communicationStyle ?? {};
  const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
  return {
    characterTemplateId: input.characterTemplateId,
    voiceKey: `${input.publicHandle || input.slug || input.characterTemplateId}-default`,
    characteristics: {
      warmth: number(personality['warmth'] ?? personality['empathetic'], .6),
      energy: number(personality['energy'] ?? personality['social_energy'], .55),
      pace: number(communication['pace'], .5),
      expressiveness: number(personality['expressiveness'] ?? personality['playful'], .55),
      softness: number(personality['softness'] ?? personality['reserved'], .45),
    },
  };
}

export function selectSceneSpeakers(input: { message: string; candidates: SceneSpeakerCandidate[]; maxSpeakers?: number }): SceneSpeakerSelection {
  const available = input.candidates.filter((candidate) => candidate.available !== false);
  const normalized = input.message.toLowerCase();
  const addressed=available.filter((candidate)=>new RegExp(`\\b${escapeRegExp(candidate.name.toLowerCase())}\\b`).test(normalized));
  const directlyAddressed = addressed[0];
  const groupAddressed = addressed.length>1||/\b(you (?:all|both|guys|two)|everyone|what do (?:you all|you both)|what did (?:you all|you both)|either of you)\b/i.test(input.message);
  if (directlyAddressed && !groupAddressed) return { speakerInstanceIds: [directlyAddressed.characterInstanceId], addressedCharacterInstanceId: directlyAddressed.characterInstanceId, groupAddressed: false, reasonCodes: ['direct_address'] };

  const score = (candidate: SceneSpeakerCandidate) => {
    let value = candidate.role === 'primary_companion' ? .35 : 0;
    if(addressed.some((item)=>item.characterInstanceId===candidate.characterInstanceId))value+=.65;
    value += Math.max(0, Math.min(1, candidate.topicRelevance ?? .4)) * .28;
    value += Math.max(0, Math.min(1, candidate.knowledgeRelevance ?? .3)) * .25;
    value += Math.max(0, Math.min(1, candidate.directness ?? .5)) * .08;
    value += Math.max(0, Math.min(1, candidate.socialEnergy ?? .5)) * .06;
    value += Math.max(0, Math.min(1, candidate.socialAffinity ?? .4)) * .07;
    if(/disagree|argument|honest|really think|wrong/i.test(input.message))value+=Math.max(0,Math.min(1,candidate.socialTension??0))*.08;
    if(['friend','close_friends','family','coworker'].includes(candidate.relationshipType??''))value+=.025;
    if (candidate.lastSpoke) value -= .3;
    if(candidate.recentlyInterrupted)value-=.18;
    return value;
  };
  const ranked = [...available].sort((left, right) => score(right) - score(left));
  const limit = Math.max(1, Math.min(input.maxSpeakers ?? 2, groupAddressed ? 2 : 1));
  const selected = ranked.filter((candidate, index) => index === 0 || (groupAddressed && score(candidate) >= .35)).slice(0, limit);
  return { speakerInstanceIds: selected.map((candidate) => candidate.characterInstanceId), groupAddressed, reasonCodes: [groupAddressed ? 'group_address' : 'natural_turn', ...(selected.length < available.length ? ['silence_allowed'] : [])] };
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
