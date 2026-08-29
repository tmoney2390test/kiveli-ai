import { describe, expect, it } from 'vitest';
import { budgetContextSections, contextInputTokenCeiling, estimateContextTokens, rankContextRecords } from './context-budget.ts';

describe('conversation context budgeter', () => {
  it('retains protected canonical truth and stays within the total ceiling', () => {
    const result = budgetContextSections([
      { key: 'USER_PERSONA', order: 0, required: true, protected: true, priority: 100, relevance: 1, variants: [{ label: 'full', content: '<USER_PERSONA>Tim</USER_PERSONA>' }] },
      { key: 'PRESENT_REALITY', order: 1, required: true, protected: true, priority: 100, relevance: 1, variants: [{ label: 'full', content: '<PRESENT_REALITY>Riverwalk</PRESENT_REALITY>' }] },
      { key: 'RECENT_CONVERSATION', order: 2, required: true, priority: 100, relevance: 1, variants: [{ label: 'full', content: `<RECENT_CONVERSATION>${'important exchange '.repeat(800)}</RECENT_CONVERSATION>` }, { label: 'minimal', content: '<RECENT_CONVERSATION>latest exchange</RECENT_CONVERSATION>' }] },
      { key: 'SOCIAL_KNOWLEDGE', order: 3, priority: 20, relevance: .1, variants: [{ label: 'full', content: `<SOCIAL_KNOWLEDGE>${'background '.repeat(800)}</SOCIAL_KNOWLEDGE>`, recordIds: ['social-1'] }] },
    ], { ceilingTokens: 1_000, now: new Date('2026-08-19T12:00:00Z') });
    expect(result.estimatedTokens).toBeLessThanOrEqual(1_000);
    expect(result.prompt).toContain('Tim');
    expect(result.prompt).toContain('Riverwalk');
    expect(result.prompt).toContain('latest exchange');
    expect(result.sections.find((item) => item.key === 'SOCIAL_KNOWLEDGE')?.decision).toBe('dropped_low_relevance');
  });

  it('uses distinct total ceilings for each intelligence profile', () => {
    expect(contextInputTokenCeiling('core')).toBeLessThan(contextInputTokenCeiling('deep'));
    expect(contextInputTokenCeiling('deep')).toBeLessThan(contextInputTokenCeiling('director'));
  });

  it('ranks records by intent, lexical match, freshness, and active state', () => {
    const records = [
      { id: 'old', text: 'A completed museum visit.', at: '2025-01-01T00:00:00Z', active: false },
      { id: 'match', text: 'Rooftop drinks Saturday at eight.', at: '2026-08-19T10:00:00Z', active: true },
      { id: 'other', text: 'Bought a new book.', at: '2026-08-19T11:00:00Z', active: false },
    ];
    const ranked = rankContextRecords(records, { category: 'plan', intent: 'plan', query: 'Are rooftop drinks still on?', now: new Date('2026-08-19T12:00:00Z'), text: (item) => item.text, id: (item) => item.id, occurredAt: (item) => item.at, active: (item) => item.active });
    expect(ranked[0]?.record.id).toBe('match');
    expect(ranked[0]?.reasonCodes).toEqual(expect.arrayContaining(['intent_match', 'lexical_match', 'recent', 'active']));
  });

  it('uses a conservative token estimate rather than raw character count', () => {
    expect(estimateContextTokens('a'.repeat(360))).toBe(100);
    expect(estimateContextTokens('今日は図書館で静かに本を読んでいたよ。')).toBeGreaterThan(15);
    expect(estimateContextTokens('😊😊')).toBe(4);
    expect(estimateContextTokens('A short English sentence.')).toBeLessThan(12);
  });

  it('uses non-Latin terms when ranking same-language context', () => {
    const records = [
      { id: 'match', text: '図書館で読んだ本の話' },
      { id: 'other', text: '明日のコーヒーの予定' },
    ];
    const ranked = rankContextRecords(records, { category: 'memory', intent: 'memory_overview', query: '図書館の本を覚えてる？', text: (item) => item.text, id: (item) => item.id });
    expect(ranked[0]?.record.id).toBe('match');
    expect(ranked[0]?.reasonCodes).toContain('lexical_match');
  });
});
