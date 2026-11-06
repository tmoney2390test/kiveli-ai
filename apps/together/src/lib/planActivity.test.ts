import { describe, expect, it } from 'vitest';
import { cleanPlanActivity, planActivityOptions } from './planActivity';
describe('plan activity choices',()=>{
  it('keeps custom words and punctuation while removing accidental whitespace',()=>expect(cleanPlanActivity('  Make\n pancakes & coffee  ')).toBe('Make pancakes & coffee'));
  it('excludes the current activity and duplicate authored choices',()=>expect(planActivityOptions(['Have coffee','have_coffee','Play_cards','play cards','  Paint the shuttle  '],'have_coffee')).toEqual(['Play cards','Paint the shuttle']));
  it('rejects blank and oversized suggestions without removing the custom option',()=>expect(planActivityOptions([' ', 'x'.repeat(121)],'Have coffee')).toEqual([]));
});
