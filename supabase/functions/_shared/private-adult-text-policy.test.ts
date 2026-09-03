import { assertEquals } from 'jsr:@std/assert@1';
import { privateDialoguePolicyMetadata, privateAdultTextTelemetry, resolvePrivateDialoguePolicy } from './private-adult-text-policy.ts';
import type { AdultAccessContext } from './web-adult-access.ts';

function access(overrides: Partial<AdultAccessContext> = {}): AdultAccessContext {
  return {
    premium_access: false,
    adult_eligible: true,
    adult_mode_enabled: false,
    client_surface: 'native_or_unknown',
    adult_generation_enabled: false,
    authorized_web_adult: false,
    adult_eligibility: { allowed: true, reason: 'verified_adult' },
    private_adult_text_mode: 'on',
    web_session_id: null,
    ...overrides,
  };
}

const adultInstance = (id = 'adult') => ({ id, together_character_templates: { age: 28, description: 'An adult musician.' }, together_character_versions: {} });
const policy=(overrides:Record<string,unknown>={})=>resolvePrivateDialoguePolicy({access:access(),requestedMode:'explicit',conversationMode:'direct',participants:[adultInstance()],safetyAllowed:true,...overrides});

Deno.test('private adult text allows a free eligible native user without a web session',()=>{
  assertEquals(policy().effectiveMode,'explicit');
});

Deno.test('private adult text decision is identical for free and paid adults',()=>{
  const free=policy({access:access({premium_access:false})}),paid=policy({access:access({premium_access:true})});
  assertEquals(free.policy,paid.policy);
  assertEquals(paid.effectiveMode,'explicit');
});

Deno.test('stored policy metadata is structured and independent of subscription state',()=>{
  const resolved=policy({access:access({premium_access:false})});
  const metadata=privateDialoguePolicyMetadata({policy:resolved,access:access({premium_access:false}),conversationMode:'direct',providerRoute:'explicit_dialogue'});
  const telemetry=privateAdultTextTelemetry({policy:resolved,access:access({premium_access:false}),conversationMode:'direct'});
  assertEquals(metadata.sexualContentLevel,'explicit');
  assertEquals(metadata.adultEligibilityApplied,true);
  assertEquals('premiumAccess' in metadata,false);
  assertEquals('subscriptionTier' in metadata,false);
  assertEquals('rawPrompt' in telemetry,false);
});

Deno.test('shadow mode records eligibility without applying explicit generation',()=>{
  const result=policy({access:access({private_adult_text_mode:'shadow'})});
  assertEquals(result.effectiveMode,'mature');
  assertEquals(result.rollout.shadowEligible,true);
  assertEquals(result.rollout.generationAllowed,false);
});

Deno.test('one ambiguous participant blocks the complete group',()=>{
  const participants=[
    {character_instance_id:'a',together_character_instances:adultInstance('a')},
    {character_instance_id:'b',together_character_instances:{id:'b',together_character_templates:{age:25,description:'A high school student.'},together_character_versions:{}}},
  ];
  const result=policy({conversationMode:'group',participants});
  assertEquals(result.effectiveMode,'mature');
  assertEquals(result.allParticipantsAdults,false);
  assertEquals(result.policy.reasonCode,'adult_participants_required');
});

Deno.test('group eligibility is recomputed after an ineligible participant is removed',()=>{
  const eligible={character_instance_id:'a',together_character_instances:adultInstance('a')};
  const unknown={character_instance_id:'b',together_character_instances:{id:'b',together_character_templates:{},together_character_versions:{}}};
  assertEquals(policy({conversationMode:'group',participants:[eligible,unknown]}).effectiveMode,'mature');
  assertEquals(policy({conversationMode:'group',participants:[eligible]}).effectiveMode,'explicit');
});

Deno.test('prohibited-content safety fails closed before explicit routing',()=>{
  const result=policy({safetyAllowed:false});
  assertEquals(result.effectiveMode,'mature');
  assertEquals(result.policy.reasonCode,'prohibited_content');
});
