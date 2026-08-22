import { entitlementsForTier } from '../../../packages/together-domain/src/entitlements.ts';
import { resolveServerExperienceCapabilities } from './kivelle-multimodal.ts';

Deno.test('live calls are credit-gated for every tier while voice notes remain subscription-gated',()=>{
  const preferences={companionVoiceNotes:true,liveVoiceCalls:true};
  const free=resolveServerExperienceCapabilities(preferences,[...entitlementsForTier('free')]).experience;
  const plus=resolveServerExperienceCapabilities(preferences,[...entitlementsForTier('kivelle_plus')]).experience;
  const max=resolveServerExperienceCapabilities(preferences,[...entitlementsForTier('kivelle_max')]).experience;
  assert(!free.voiceNotes&&free.liveVoiceCalls);
  assert(plus.voiceNotes&&plus.liveVoiceCalls);
  assert(max.voiceNotes&&max.liveVoiceCalls);
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
