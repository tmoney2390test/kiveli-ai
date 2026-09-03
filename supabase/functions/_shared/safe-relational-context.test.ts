import{assertEquals}from'jsr:@std/assert';
import{deriveSafeRelationalSummary}from'./safe-relational-context.ts';

const proposal=(relationshipChanges:Record<string,number>)=>({relationshipChanges,chemistry:{userFlirtSignal:0,characterFlirtSignal:0,mutualChemistry:0,heatDelta:0},memoryCandidates:[],resolvedThreadIds:[],newThreads:[],momentCandidate:false,moodEffects:{},actionCandidates:[],placeOpinionCandidates:[],referencedEntities:[],mentionedMemoryIds:[],reinforcedMemoryIds:[],correctedMemorySubjects:[],source:'deterministic' as const});

Deno.test('safe relational context derives only bounded relationship continuity and moderates it',async()=>{
  let moderated='';
  const summary=await deriveSafeRelationalSummary({
    analysis:{analyze:()=>Promise.resolve(proposal({trust:2,comfort:1}))},
    moderation:{check:(text)=>{moderated=text;return Promise.resolve({allowed:true,flagged:false,categories:[],categoryScores:{}});}},
    userText:'restricted canonical input',assistantText:'restricted canonical output',
  });
  assertEquals(summary,'The private exchange left you both feeling closer, more trusting, and more at ease with one another.');
  assertEquals(moderated,summary);
});

Deno.test('safe relational context fails closed when independent moderation is unavailable',async()=>{
  const summary=await deriveSafeRelationalSummary({
    analysis:{analyze:()=>Promise.resolve(proposal({trust:2}))},
    moderation:{check:()=>Promise.resolve({allowed:true,flagged:false,categories:['moderation/unavailable'],categoryScores:{}})},
    userText:'restricted',assistantText:'restricted',group:true,
  });
  assertEquals(summary,'You and your companions shared a more intimate moment and grew closer.');
});
