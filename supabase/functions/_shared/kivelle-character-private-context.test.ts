import{assertEquals}from'https://deno.land/std@0.224.0/assert/mod.ts';
import{mergePrivateCharacterPromptContext}from'./kivelle-character-private-context.ts';

Deno.test('private truths remain model-only while adult fields require an authorized text context',()=>{
  const profile={private_truth:'The sealed vow is theirs.',adult_continuity:'Keep the same voice.',intimate_anatomy:'private anatomy',hidden_sexual:'private history'};
  assertEquals(mergePrivateCharacterPromptContext({traits:['precise']},profile,false),{traits:['precise'],privateTruth:'The sealed vow is theirs.'});
  assertEquals(mergePrivateCharacterPromptContext({traits:['precise']},profile,true),{
    traits:['precise'],privateTruth:'The sealed vow is theirs.',adultContinuity:'Keep the same voice.',intimateAnatomy:'private anatomy',hiddenSexual:'private history',
  });
});

Deno.test('empty private fields do not alter the public character bible',()=>{
  assertEquals(mergePrivateCharacterPromptContext({fictional:true},{private_truth:'  '},true),{fictional:true});
});
