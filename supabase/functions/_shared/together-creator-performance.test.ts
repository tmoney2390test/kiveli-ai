import { characterDraftSchema, deterministicCharacterDraft } from './together-creator.ts';
import { isValidCharacterPerformance, normalizeCharacterPerformance } from '../../../packages/together-domain/src/character-performance.ts';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}

Deno.test('future quick-create/Studio proposals always contain the performance contract',()=>{
  for(const concept of ['A reserved architect named Nora who enjoys jazz.','An outgoing musician named Ari with dry humor.','A warm teacher named Leah who values independence.']){
    const proposal=deterministicCharacterDraft(concept);
    assert(isValidCharacterPerformance(proposal.performanceProfile),'Missing behavior profile');
    const {performanceProfile:_,...legacy}=proposal;
    assert(isValidCharacterPerformance(characterDraftSchema.parse(legacy).performanceProfile),'Legacy provider output needs compatible behavior');
  }
});

Deno.test('creator-provided authored examples survive proposal validation',()=>{
  const proposal=deterministicCharacterDraft('A reserved writer named Nora who enjoys books.');
  const performance=normalizeCharacterPerformance({performance:{states:{threatened:{behavior:'Stops explaining and notices the nearest sound.',speech:'Brief and uncertain.',examples:['Wait. I heard it too.','Let me listen.']}}}});
  const parsed=characterDraftSchema.parse({...proposal,performanceProfile:performance});
  assert(parsed.performanceProfile.states.threatened.examples[0]==='Wait. I heard it too.','Authored voice was replaced');
});
