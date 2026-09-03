import { describe,expect,it } from 'vitest';
import { chatDynamismChoices,reasoningChoicesForTier } from './chatGenerationOptions';

describe('chat generation setting choices',()=>{
  it('exposes the five exact dynamism labels with Natural recommended',()=>{
    expect(chatDynamismChoices.map((choice)=>[choice.value,choice.label])).toEqual([[0,'Grounded'],[25,'Steady'],[50,'Natural'],[75,'Expressive'],[100,'Wild']]);
    expect(chatDynamismChoices.map((choice)=>choice.description)).toEqual(['Consistent, direct, and predictable.','Natural variation with strong conversational consistency.','Balanced personality, creativity, and consistency.','More colorful, spontaneous, and emotionally varied.','Bold, surprising, and highly unpredictable.']);
    expect(chatDynamismChoices.find((choice)=>choice.value===50)?.badge).toBe('Recommended');
  });

  it('uses the plan cap only for explicit reasoning selections',()=>{
    const free=reasoningChoicesForTier('free');
    expect(free.find((choice)=>choice.value==='auto')?.locked).toBe(false);
    expect(free.find((choice)=>choice.value==='low')?.locked).toBe(false);
    expect(free.find((choice)=>choice.value==='medium')?.locked).toBe(true);
    expect(free.map((choice)=>choice.description)).toEqual(['Kivelli chooses the right depth for each message.','Fastest responses for simple conversation.','A little more thought while staying responsive.','Deeper reasoning for emotional and complex moments.','Maximum available reasoning for important scenes.']);
    expect(reasoningChoicesForTier('kivelle_plus').find((choice)=>choice.value==='medium')?.locked).toBe(false);
    expect(reasoningChoicesForTier('kivelle_plus').find((choice)=>choice.value==='high')?.locked).toBe(true);
    expect(reasoningChoicesForTier('kivelle_max').every((choice)=>!choice.locked)).toBe(true);
  });
});
