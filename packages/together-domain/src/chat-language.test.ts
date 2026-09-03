import { describe, expect, it } from 'vitest';
import {
  chatLanguageOptions,
  chatLanguageFromMessageMetadata,
  chatLanguageSafetyBoundary,
  chatLanguagePreviewText,
  chatLanguagePromptInstruction,
  normalizeChatLanguage,
  openAiTranscriptionLanguage,
  resolveChatLanguageForText,
  xaiVoiceLanguage,
} from './chat-language.ts';

describe('chat language', () => {
  it('fails closed to English for unknown stored values', () => {
    expect(normalizeChatLanguage('not-a-language')).toBe('en');
    expect(normalizeChatLanguage(undefined)).toBe('en');
  });

  it('uses provider-compatible BCP-47 voice codes', () => {
    expect(xaiVoiceLanguage('es-MX')).toBe('es-MX');
    expect(xaiVoiceLanguage('pt-BR')).toBe('pt-BR');
    expect(openAiTranscriptionLanguage('es-MX')).toBe('es');
    expect(openAiTranscriptionLanguage('auto')).toBeNull();
  });

  it('keeps the launch list compatible with every text route', () => {
    for (const option of chatLanguageOptions) {
      expect(option.textProviders).toEqual(['openai', 'xai', 'gemini']);
    }
  });

  it('makes language a presentation rule without translating canonical names', () => {
    expect(chatLanguagePromptInstruction('fr')).toContain('Reply in French');
    expect(chatLanguagePromptInstruction('fr')).toContain('place names');
    expect(chatLanguagePromptInstruction('auto')).toContain('latest substantive message');
    expect(chatLanguagePromptInstruction('auto')).toContain('code fragment');
  });

  it('snapshots message language while legacy messages use provider detection', () => {
    expect(chatLanguageFromMessageMetadata({ chatLanguage: 'pt-BR' })).toBe('pt-BR');
    expect(chatLanguageFromMessageMetadata({ chatLanguage: 'unknown' })).toBe('auto');
    expect(chatLanguageFromMessageMetadata(undefined)).toBe('auto');
  });

  it('uses short localized voice previews', () => {
    expect(chatLanguagePreviewText('ja')).toBe('こんにちは。');
    expect(chatLanguagePreviewText('es-MX')).toBe('Hola.');
  });

  it('localizes deterministic safety responses without reciting policy', () => {
    expect(chatLanguageSafetyBoundary('Avery', 'de')).toContain('Nein');
    expect(chatLanguageSafetyBoundary('Avery', 'auto')).toContain('another direction');
    expect(chatLanguageSafetyBoundary('Avery', 'auto')).not.toMatch(/consent|safety boundar/i);
    expect(chatLanguageSafetyBoundary('Avery', 'auto', '今はやめて')).toContain('だめ');
    expect(chatLanguageSafetyBoundary('Avery', 'auto', '今はやめて')).not.toMatch(/合意|安全の境界/);
  });

  it('detects supported scripts and requires a clear Latin-language signal', () => {
    expect(resolveChatLanguageForText('auto', '¿Dónde estás ahora?')).toBe('es-MX');
    expect(resolveChatLanguageForText('auto', '今日はどうだった？')).toBe('ja');
    expect(resolveChatLanguageForText('auto', 'Kivelle', ['Je suis ici avec toi.'])).toBe('fr');
    expect(resolveChatLanguageForText('auto', 'Okay')).toBe('en');
  });

  it('detects short greetings without switching for an isolated foreign proper noun', () => {
    expect(resolveChatLanguageForText('auto', 'Bonjour')).toBe('fr');
    expect(resolveChatLanguageForText('auto', 'こんにちは')).toBe('ja');
    expect(resolveChatLanguageForText('auto', 'I would like to visit 東京')).toBe('en');
  });
});
