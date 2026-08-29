import { describe,expect,it } from 'vitest';
import { memoryCategoryCount,mergeMemoryPages,optimisticMemoryMutation,presentInsightText } from './memoryCenter';
import type { MemoryCenterItem } from '../types';

const memory=(id:string,pinned=false)=>({id,character_instance_id:'character',memory_type:'semantic',canonical_text:`User likes ${id}.`,pinned,status:'active',created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-01T00:00:00Z'} as MemoryCenterItem);

describe('memory center helpers',()=>{
  it('combines category counts without relying on the current page',()=>expect(memoryCategoryCount('about',{semantic:12,emotional:3},30)).toBe(15));
  it('merges cursor pages idempotently',()=>expect(mergeMemoryPages([memory('a')],[memory('a',true),memory('b')])).toEqual([memory('a',true),memory('b')]));
  it('applies optimistic bulk operations',()=>{expect(optimisticMemoryMutation([memory('a'),memory('b')],['a'],'pin')[0]?.pinned).toBe(true);expect(optimisticMemoryMutation([memory('a'),memory('b')],['a'],'forget').map((item)=>item.id)).toEqual(['b']);});
  it('removes canonical internal phrasing from Max insights',()=>expect(presentInsightText('User likes rainy mornings.','Avery')).toBe('You like rainy mornings.'));
});
