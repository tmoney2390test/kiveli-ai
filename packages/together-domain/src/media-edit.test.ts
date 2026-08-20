import { describe,expect,it } from 'vitest';
import { buildMediaEditConstraint,classifyMediaEditSemantics,normalizeMediaEditInstruction,resolveMediaEditContentLevel } from './media-edit.ts';

describe('media edits',()=>{
  it('never lowers the source content level',()=>{
    expect(resolveMediaEditContentLevel('explicit','make the lighting warmer')).toBe('explicit');
    expect(resolveMediaEditContentLevel('standard','remove her shirt')).toBe('explicit');
  });

  it('separates quality corrections from creative derivatives',()=>{
    expect(classifyMediaEditSemantics('Fix the distorted hands')).toBe('correction');
    expect(classifyMediaEditSemantics('Change the dress to red')).toBe('creative_variant');
  });

  it('normalizes untrusted edit text and locks unrelated visual details',()=>{
    expect(normalizeMediaEditInstruction('  Change <that>   dress  ')).toBe('Change that dress');
    expect(buildMediaEditConstraint('Change the dress to red','creative_variant')).toContain('preserve every visual element');
  });
});
