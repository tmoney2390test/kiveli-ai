import{assert,assertEquals}from'https://deno.land/std@0.224.0/assert/mod.ts';
import{initiativeRewritePreservesFacts,proactiveVoicePrompt,sanitizeInitiativeText}from'./kivelle-proactive-voice.ts';

Deno.test('proactive voice prompt isolates the selected character and preserves canonical facts',()=>{
  const prompt=proactiveVoicePrompt({instance:{relationship_stage:'friend',current_activity:'closing the bookstore',together_character_templates:{name:'Evelyn'},together_character_versions:{character_bible:{traits:['dry','thoughtful']},communication_style:{directness:.6},personality_config:{warmth:.7}}},relationship:{trust:30,familiarity:35,comfort:28},draft:'I found the book you asked about.',reason:'Open thread follow-up',sourceSummary:'The requested book arrived.',recent:[{role:'user',content:'Let me know if it arrives.'}],chatLanguage:'it'});
  assert(prompt.includes('Name: Evelyn'));
  assert(prompt.includes('I found the book you asked about.'));
  assert(prompt.includes('Do not invent a new event'));
  assert(prompt.includes('Reply in Italian'));
});

Deno.test('proactive text sanitation removes wrappers and rejects model disclosure',()=>{
  assertEquals(sanitizeInitiativeText('```text\nMessage: Hey—you crossed my mind.\n```'),'Hey—you crossed my mind.');
  assertEquals(sanitizeInitiativeText('As an AI, I cannot do that.'),'');
});

Deno.test('proactive voice rejects rewrites that lose concrete timing',()=>{
  assertEquals(initiativeRewritePreservesFacts('See you Friday at 8:30.','Friday at 8:30 still works for me.'),true);
  assertEquals(initiativeRewritePreservesFacts('See you Friday at 8:30.','Later still works for me.'),false);
  assertEquals(initiativeRewritePreservesFacts('See you Friday at 8:30.','On se voit vendredi à 8:30.','fr'),true);
});
