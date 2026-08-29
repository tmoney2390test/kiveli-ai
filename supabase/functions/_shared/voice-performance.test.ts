import type { CompanionVoiceProfile } from '../../../packages/together-domain/src/multimodal.ts';
import { prepareCompanionSpeech } from './voice-performance.ts';

const voice:CompanionVoiceProfile={characterTemplateId:'character-1',voiceKey:'character-1-default',characteristics:{pace:.4,energy:.5}};

Deno.test('voice performance removes visual markdown and preserves authored words',()=>{
  const result=prepareCompanionSpeech({canonicalText:'**Hey.** *sighs* Meet me at 7:00 PM.',voiceProfile:voice,mood:'tender'});
  assert(result.spokenText==='Hey. [sigh] Meet me at 7 pm.');
  assert(result.speed>=.7&&result.speed<=1.5);
});

Deno.test('voice performance removes unspoken stage directions without inventing content',()=>{
  const result=prepareCompanionSpeech({canonicalText:'*smiles and looks away* I missed you.',voiceProfile:voice});
  assert(result.spokenText==='I missed you.');
});

Deno.test('voice performance safely abridges messages over 2,000 characters',()=>{
  const opening='I want you to remember this opening.';
  const middle=Array.from({length:90},(_,index)=>`Detail ${index+1} stays grounded in the canonical message.`).join(' ');
  const ending='And this is the final promise.';
  const canonical=`${opening} ${middle} ${ending}`;
  const result=prepareCompanionSpeech({canonicalText:canonical,voiceProfile:voice});
  assert(result.shortened);
  assert(result.sourceCharacterCount===canonical.length);
  assert(result.characterCount<=2_000);
  assert(result.spokenText.startsWith(opening));
  assert(result.spokenText.endsWith(ending));
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
