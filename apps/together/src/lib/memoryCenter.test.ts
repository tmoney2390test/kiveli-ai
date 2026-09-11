import { describe,expect,it } from 'vitest';
import { memoryCategoryCount,memoryJournalLabel,mergeMemoryPages,optimisticMemoryMutation,presentInsightText } from './memoryCenter';
import type { MemoryCenterItem } from '../types';

const memory=(id:string,pinned=false)=>({id,character_instance_id:'character',memory_type:'semantic',canonical_text:`User likes ${id}.`,pinned,status:'active',created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-01T00:00:00Z'} as MemoryCenterItem);

describe('memory center helpers',()=>{
  it('uses journal category counts from the server totals',()=>{
    expect(memoryCategoryCount('about',{about:8,semantic:12,emotional:3},30)).toBe(8);
    expect(memoryCategoryCount('core_rules',{core_rule:2,relationship:9},30)).toBe(2);
    expect(memoryCategoryCount('additional',{additional:11},30)).toBe(11);
    expect(memoryCategoryCount('upcoming',{open_thread:4},30)).toBe(4);
  });
  it('labels authored Core Rules and persona-scoped About you',()=>{
    expect(memoryJournalLabel({memory_type:'relationship',kind:'core_rule',coreRule:true})).toBe('Core rules');
    expect(memoryJournalLabel({memory_type:'semantic',kind:'about',personaName:'Maya'})).toBe('About you · Maya');
    expect(memoryJournalLabel({memory_type:'preference',kind:'additional'})).toBe('Additional details');
  });
  it('merges cursor pages idempotently',()=>expect(mergeMemoryPages([memory('a')],[memory('a',true),memory('b')])).toEqual([memory('a',true),memory('b')]));
  it('applies optimistic bulk operations',()=>{expect(optimisticMemoryMutation([memory('a'),memory('b')],['a'],'pin')[0]?.pinned).toBe(true);expect(optimisticMemoryMutation([memory('a'),memory('b')],['a'],'forget').map((item)=>item.id)).toEqual(['b']);});
  it('removes canonical internal phrasing from Max insights',()=>expect(presentInsightText('User likes rainy mornings.','Avery')).toBe('You like rainy mornings.'));
});
