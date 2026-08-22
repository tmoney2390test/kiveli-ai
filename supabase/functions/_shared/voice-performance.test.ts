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

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
