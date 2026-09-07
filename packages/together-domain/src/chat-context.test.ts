import { describe, expect, it } from 'vitest';
import { normalizeContextPreference, selectedContextCeiling, recentHistoryWithinBudget } from './chat-context';

describe('context choices',()=>{
  it('keeps existing included plan allowances and safely normalizes missing settings',()=>{
    expect(normalizeContextPreference(undefined)).toBe('included');expect(normalizeContextPreference('128k')).toBe('included');
    expect(['core','deep','director'].map(profile=>selectedContextCeiling('included',profile))).toEqual([9000,14000,20000]);
    expect(selectedContextCeiling('extended_32k','core')).toBe(32000);expect(selectedContextCeiling('maximum_64k','deep')).toBe(64000);
  });
  it('retains complete contiguous messages in chronological order past the old 28-row cap',()=>{
    const rows=Array.from({length:250},(_,id)=>({id,content:`Message ${id}. ${'Conversation '.repeat(20)}`}));
    const recent=recentHistoryWithinBudget(rows,32000);
    expect(recent.length).toBeGreaterThan(28);expect(recent.at(-1)?.id).toBe(249);expect(recent.map(row=>row.id)).toEqual(rows.slice(-recent.length).map(row=>row.id));
    expect(rows.length).toBe(250);
  });
  it('never clips or skips an oversized message to fetch unrelated older turns',()=>{
    const rows=[{content:'old'}, {content:'a'.repeat(10000)}, {content:'new'}];
    expect(recentHistoryWithinBudget(rows,100)).toEqual([{content:'new'}]);
  });
});
