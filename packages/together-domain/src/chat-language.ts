export const chatLanguagePreferences = [
  'auto',
  'en',
  'es-MX',
  'fr',
  'it',
  'de',
  'pt-BR',
  'ja',
  'ko',
  'zh',
] as const;

export type ChatLanguagePreference = typeof chatLanguagePreferences[number];

export type ChatLanguageOption = {
  value: ChatLanguagePreference;
  label: string;
  nativeLabel: string;
  textProviders: readonly ('openai' | 'xai' | 'gemini')[];
  voiceProviderCode: ChatLanguagePreference;
};

const ALL_TEXT_PROVIDERS = ['openai', 'xai', 'gemini'] as const;

/**
 * The launch list is intentionally the common, production-documented subset
 * across Kivelle's text providers and xAI voice provider. Provider-specific
 * codes stay centralized here instead of leaking into chat UI or prompts.
 */
export const chatLanguageOptions: readonly ChatLanguageOption[] = [
  { value: 'auto', label: 'Match my language', nativeLabel: 'Automatic', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'auto' },
  { value: 'en', label: 'English', nativeLabel: 'English', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'en' },
  { value: 'es-MX', label: 'Spanish', nativeLabel: 'Español', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'es-MX' },
  { value: 'fr', label: 'French', nativeLabel: 'Français', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'fr' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'it' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'de' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português (Brasil)', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'pt-BR' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'ja' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'ko' },
  { value: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文', textProviders: ALL_TEXT_PROVIDERS, voiceProviderCode: 'zh' },
] as const;

export function normalizeChatLanguage(value: unknown): ChatLanguagePreference {
  return chatLanguagePreferences.includes(value as ChatLanguagePreference)
    ? value as ChatLanguagePreference
    : 'en';
}

export function chatLanguageOption(value: unknown): ChatLanguageOption {
  const normalized = normalizeChatLanguage(value);
  return chatLanguageOptions.find((option) => option.value === normalized) ?? chatLanguageOptions[1]!;
}

export function chatLanguagePromptInstruction(value: unknown): string {
  const option = chatLanguageOption(value);
  if (option.value === 'auto') {
    return 'Reply in the language used by the user in their latest substantive message. If it is ambiguous, continue in the language of the recent conversation. Do not switch languages because of a proper noun, quotation, URL, username, code fragment, isolated foreign phrase, attachment-only turn, or emoji.';
  }
  return `Reply in ${option.label}. Preserve the companion's established personality, cadence, humor, emotional tone, and level of directness. Keep canonical proper nouns unchanged: Kivelle character names, place names, and world names. Also preserve URLs, usernames, code, and text the user explicitly asks to quote verbatim unless an authored localized name is supplied.`;
}

/**
 * A message keeps the language used when it was created. Legacy messages have
 * no snapshot, so speech providers should infer from the text instead of
 * inheriting a conversation setting that may have changed years later.
 */
export function chatLanguageFromMessageMetadata(value: unknown): ChatLanguagePreference {
  const metadata = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return chatLanguagePreferences.includes(metadata['chatLanguage'] as ChatLanguagePreference)
    ? metadata['chatLanguage'] as ChatLanguagePreference
    : 'auto';
}

export function resolveChatLanguageForText(
  preference: unknown,
  latestText: unknown,
  recentTexts: readonly unknown[] = [],
): Exclude<ChatLanguagePreference, 'auto'> {
  const selected = normalizeChatLanguage(preference);
  if (selected !== 'auto') return selected;
  for (const value of [latestText, ...recentTexts]) {
    const detected = detectSupportedLanguage(typeof value === 'string' ? value : '');
    if (detected) return detected;
  }
  return 'en';
}

function detectSupportedLanguage(value: string): Exclude<ChatLanguagePreference, 'auto'> | null {
  const text = value.normalize('NFKC').replace(/https?:\/\/\S+|`[^`]*`/gu, ' ').trim();
  if (!text || !/[\p{L}\p{N}]/u.test(text)) return null;
  const latinCount = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  const japaneseCount = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const koreanCount = (text.match(/\p{Script=Hangul}/gu) ?? []).length;
  const hanCount = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const dominant = (count: number) => count > 0 && (latinCount === 0 || count >= 4 && count >= latinCount * .5);
  if (dominant(japaneseCount)) return 'ja';
  if (dominant(koreanCount)) return 'ko';
  if (dominant(hanCount) && japaneseCount === 0) return 'zh';
  const compact = text.toLocaleLowerCase().replace(/[^\p{L}]+/gu, ' ').trim();
  if (/^(?:hola|gracias|buenos dias|buenas tardes|buenas noches)$/u.test(compact)) return 'es-MX';
  if (/^(?:bonjour|merci|bonsoir|salut)$/u.test(compact)) return 'fr';
  if (/^(?:ciao|grazie|buongiorno|buonasera)$/u.test(compact)) return 'it';
  if (/^(?:hallo|danke|guten morgen|guten abend)$/u.test(compact)) return 'de';
  const accentlessCompact = compact.normalize('NFD').replace(/(?<=\p{Script=Latin})\p{M}+/gu, '');
  if (/^(?:ola|obrigad[oa]|bom dia|boa tarde|boa noite)$/u.test(accentlessCompact)) return 'pt-BR';
  const words = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
  const joined = ` ${words.join(' ')} `;
  const scores: Array<[Exclude<ChatLanguagePreference, 'auto'>, number]> = [
    ['es-MX', languageScore(joined, [' el ',' la ',' que ',' por ',' para ',' estoy ',' quiero ',' puedes ',' hola ',' dónde ',' cómo ',' gracias ']) + (/[¿¡ñ]/iu.test(text) ? 2 : 0)],
    ['fr', languageScore(joined, [' je ',' tu ',' vous ',' avec ',' pour ',' pas ',' est ',' suis ',' bonjour ',' merci ',' pourquoi ']) + (/[àâçéèêëîïôùûüÿœ]/iu.test(text) ? 1 : 0)],
    ['it', languageScore(joined, [' io ',' tu ',' che ',' non ',' con ',' per ',' sono ',' voglio ',' ciao ',' grazie ',' perché '])],
    ['de', languageScore(joined, [' ich ',' du ',' sie ',' nicht ',' mit ',' und ',' bin ',' möchte ',' hallo ',' danke ',' warum ']) + (/[äöüß]/iu.test(text) ? 1 : 0)],
    ['pt-BR', languageScore(joined, [' eu ',' você ',' não ',' que ',' com ',' para ',' estou ',' quero ',' olá ',' obrigado ',' porque ']) + (/[ãõç]/iu.test(text) ? 1 : 0)],
  ];
  scores.sort((left, right) => right[1] - left[1]);
  return scores[0]![1] >= 2 && scores[0]![1] > scores[1]![1] ? scores[0]![0] : null;
}

function languageScore(text: string, markers: readonly string[]): number {
  return markers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
}

export function chatLanguageSafetyBoundary(characterName: string, value: unknown, sourceText?: unknown): string {
  const messages: Record<Exclude<ChatLanguagePreference, 'auto'>, string> = {
    en: `${characterName}: “No. Let's take this in another direction.”`,
    'es-MX': `${characterName}: «No. Mejor llevemos esto en otra dirección.»`,
    fr: `${characterName} : « Non. Prenons une autre direction. »`,
    it: `${characterName}: «No. Cambiamo direzione.»`,
    de: `${characterName}: „Nein. Lass uns das anders angehen.“`,
    'pt-BR': `${characterName}: “Não. Vamos mudar de direção.”`,
    ja: `${characterName}：「だめ。この話は別の方向に変えよう。」`,
    ko: `${characterName}: “안 돼. 다른 방향으로 이야기하자.”`,
    zh: `${characterName}：“不行。我们换个方向聊吧。”`,
  };
  const language = resolveChatLanguageForText(value, sourceText);
  return messages[language];
}

export function chatLanguageChangeSubject(value: unknown, sourceText?: unknown): string {
  const messages: Record<Exclude<ChatLanguagePreference, 'auto'>, string> = {
    en: "Let's change the subject.",
    'es-MX': 'Cambiemos de tema.',
    fr: 'Changeons de sujet.',
    it: 'Cambiamo argomento.',
    de: 'Lass uns das Thema wechseln.',
    'pt-BR': 'Vamos mudar de assunto.',
    ja: '話題を変えよう。',
    ko: '다른 이야기로 넘어가자.',
    zh: '我们换个话题吧。',
  };
  const language = resolveChatLanguageForText(value, sourceText);
  return messages[language];
}

export function xaiVoiceLanguage(value: unknown): ChatLanguagePreference {
  return chatLanguageOption(value).voiceProviderCode;
}

export function openAiTranscriptionLanguage(value: unknown): string | null {
  const normalized = normalizeChatLanguage(value);
  if (normalized === 'auto') return null;
  return normalized.split('-')[0] ?? null;
}

export function chatLanguagePreviewText(value: unknown): string {
  const previews: Record<ChatLanguagePreference, string> = {
    auto: 'Hello there.',
    en: 'Hello there.',
    'es-MX': 'Hola.',
    fr: 'Bonjour.',
    it: 'Ciao.',
    de: 'Hallo.',
    'pt-BR': 'Olá.',
    ja: 'こんにちは。',
    ko: '안녕하세요.',
    zh: '你好。',
  };
  return previews[normalizeChatLanguage(value)];
}

export function chatLanguageUserDraftFallback(value: unknown): string {
  const fallbacks: Record<ChatLanguagePreference, string> = {
    auto: 'Tell me more about that.',
    en: 'Tell me more about that.',
    'es-MX': 'Cuéntame más sobre eso.',
    fr: 'Dis-m’en plus.',
    it: 'Raccontami di più.',
    de: 'Erzähl mir mehr davon.',
    'pt-BR': 'Me conta mais sobre isso.',
    ja: 'もう少し聞かせて。',
    ko: '그 얘기 좀 더 해줘.',
    zh: '再多告诉我一点。',
  };
  return fallbacks[normalizeChatLanguage(value)];
}
