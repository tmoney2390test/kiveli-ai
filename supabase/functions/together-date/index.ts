import { z } from 'zod';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { clampRelationship, nextDatePhase, TOGETHER_IDS, track } from '../_shared/together.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), sessionId: z.string().uuid() }),
  z.object({ action: z.literal('defer'), sessionId: z.string().uuid() }),
  z.object({ action: z.literal('choose'), sessionId: z.string().uuid(), choiceId: z.string().min(1).max(80), choiceText: z.string().min(1).max(1000), freeText: z.boolean().optional() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_date', 80, 3600);
  const input = await parseBody(request, schema);
  const { data: session } = await db.from('together_date_sessions').select('*,together_date_templates(*)').eq('id', input.sessionId).eq('user_id', user.id).maybeSingle();
  if (!session) throw new AppError('NOT_FOUND', 'That date is unavailable.', 404);
  if (input.action === 'defer') {
    if (!['unlocked','upcoming'].includes(session.status)) throw new AppError('CONFLICT', 'This date cannot be deferred now.', 409);
    await db.from('together_date_sessions').update({ status: 'deferred', updated_at: new Date().toISOString() }).eq('id', session.id);
    return json({ data: { ...session, status: 'deferred' }, correlationId }, 200, correlationId);
  }
  if (input.action === 'start') {
    if (!['unlocked','upcoming','deferred'].includes(session.status)) throw new AppError('CONFLICT', 'This date is not ready to begin.', 409);
    const now = new Date().toISOString();
    const { data, error } = await db.from('together_date_sessions').update({ status: 'active', current_phase: 'arrival', phase_index: 0, started_at: now, updated_at: now }).eq('id', session.id).select('*,together_date_templates(*)').single();
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not begin the date.', 500, true);
    await track(db, user.id, 'date_started', { dateSessionId: session.id });
    return json({ data, correlationId }, 200, correlationId);
  }
  if (session.status !== 'active') throw new AppError('CONFLICT', 'Start the date before making a choice.', 409);
  const phases = session.together_date_templates.phases as Array<{ id: string; choices: Array<{ id: string; label: string }> }>;
  const phase = phases.find((item) => item.id === session.current_phase);
  const isFreeText = input.choiceId === 'say_something' && input.freeText === true;
  if (!isFreeText && !phase?.choices.some((choice) => choice.id === input.choiceId)) throw new AppError('VALIDATION_FAILED', 'That choice is not available in this scene.', 400);
  const impacts: Record<string, Record<string, number>> = { 'listen-carefully': { trust: 5, comfort: 4, respect: 4 }, 'share-honestly': { trust: 4, comfort: 5, familiarity: 4 }, 'share-dessert': { attraction: 4, affinity: 3 }, 'riverwalk': { attraction: 5, romantic_interest: 5 }, 'order-rescue': { comfort: 3, affinity: 3 }, 'airport-callback': { familiarity: 3, affinity: 3 } };
  const impact = impacts[input.choiceId] ?? { familiarity: 2, affinity: 2 };
  const { error: choiceError } = await db.from('together_date_choices').insert({ date_session_id: session.id, user_id: user.id, phase: session.current_phase, choice_id: input.choiceId, choice_text: input.choiceText, relationship_impact: impact, narrative_result: narrative(input.choiceId) });
  if (choiceError?.code === '23505') throw new AppError('CONFLICT', 'You already chose in this scene.', 409);
  if (choiceError) throw new AppError('INTERNAL_ERROR', 'Could not save that choice.', 500, true);
  const next = nextDatePhase(session.current_phase, phases);
  const state = { ...(session.state ?? {}), [session.current_phase]: isFreeText ? { choice: input.choiceId, text: input.choiceText } : input.choiceId };
  if (!next.completed) {
    const { data } = await db.from('together_date_sessions').update({ current_phase: next.phase, phase_index: next.index, state, updated_at: new Date().toISOString() }).eq('id', session.id).select('*,together_date_templates(*)').single();
    return json({ data: { session: data, narrative: narrative(input.choiceId), completed: false }, correlationId }, 200, correlationId);
  }
  const completedAt = new Date().toISOString();
  const templateName = String(session.together_date_templates.name ?? 'Shared date');
  const {data:dateChoices}=await db.from('together_date_choices').select('phase,choice_id,choice_text,narrative_result').eq('date_session_id',session.id).eq('user_id',user.id).order('created_at');
  const highlights=(dateChoices??[]).filter((choice)=>['airport-callback','share-dessert','riverwalk','share-honestly','gentle-tease','order-rescue'].includes(choice.choice_id)).map((choice)=>choice.narrative_result??choice.choice_text).slice(0,4);
  const summary=highlights.length?`During ${templateName}, ${highlights.join(' ')}`:`You and your companion shared ${templateName}, making choices that shaped the evening.`;
  const enrichedState={...state,summary,highlights,choices:(dateChoices??[]).map((choice)=>({phase:choice.phase,id:choice.choice_id,label:choice.choice_text,narrative:choice.narrative_result}))};
  await db.from('together_date_sessions').update({ status: 'completed', current_phase: next.phase, phase_index: next.index, state:enrichedState, completed_at: completedAt, updated_at: completedAt }).eq('id', session.id);
  const { data: relation } = await db.from('together_relationship_states').select('*').eq('character_instance_id', session.character_instance_id).single();
  const { data: characterInstance } = await db.from('together_character_instances').select('relationship_stage').eq('id', session.character_instance_id).eq('user_id', user.id).maybeSingle();
  const totalImpact = { trust: 7, comfort: 7, attraction: 8, affinity: 7, familiarity: 8, romantic_interest: 6 };
  const changed = clampRelationship(relation ?? {}, totalImpact, 8);
  await db.from('together_relationship_states').update({ ...changed, recent_direction: 'improving', updated_at: completedAt }).eq('character_instance_id', session.character_instance_id);
  await db.from('together_character_instances').update({ relationship_stage: 'dating', updated_at: completedAt }).eq('id', session.character_instance_id).in('relationship_stage', ['friend','flirting']);
  const { data: memory } = await db.from('together_memories').upsert({ user_id: user.id, character_instance_id: session.character_instance_id, memory_type: 'episodic', canonical_text: summary, dedupe_key: `episodic:${session.date_template_id}`, importance: .96, confidence: 1, sensitivity_category: 'none', status: 'active', metadata: { dateSessionId: session.id, dateTemplateId: session.date_template_id, choices: enrichedState.choices, highlights } }, { onConflict: 'character_instance_id,dedupe_key' }).select('id').single();
  const { data: moment } = await db.from('together_moments').insert({ user_id: user.id, character_instance_id: session.character_instance_id, title: templateName, occurred_at: completedAt, location_id: session.together_date_templates.location_id ?? TOGETHER_IDS.juniper, summary, participant_instance_ids: [session.character_instance_id], linked_memory_ids: memory ? [memory.id] : [], relationship_impact: totalImpact, relationship_stage_at_creation: characterInstance?.relationship_stage ?? null, date_session_id: session.id, media: [], moment_type: 'date' }).select('*').single();
  await track(db, user.id, 'date_completed', { dateSessionId: session.id });
  if (moment) await track(db, user.id, 'moment_created', { momentId: moment.id, type: 'date' });
  if(moment)EdgeRuntime.waitUntil(queueMediaRequest(db,{userId:user.id,characterInstanceId:session.character_instance_id,source:'date',dateSessionId:session.id,momentId:moment.id,idempotencyKey:`date:${session.id}:completion`}).then((media)=>media?kickMediaDispatcher():undefined).catch((error)=>console.warn('Together date photo unavailable',error instanceof Error?error.message:'unknown_error')));
  return json({ data: { session: { ...session, status: 'completed', current_phase: next.phase, phase_index: next.index, state:enrichedState, completed_at: completedAt }, narrative: 'The experience settles into one of those memories that already feels like an inside story.', completed: true, moment }, correlationId }, 200, correlationId);
});

function narrative(choiceId: string): string {
  const lines: Record<string,string> = { 'ask-day': 'Maya exhales, then tells you about the client who wanted “moody, but corporate.”', 'airport-callback': 'She points at you with a grin. “Your airport navigation privileges are still revoked.”', 'listen-carefully': 'Her shoulders soften. Being heard matters more than a clever answer.', 'share-honestly': 'The conversation gets quieter—and more real.', 'gentle-tease': 'Maya insists the sushi is fine while reaching urgently for her water.', 'order-rescue': '“I had it handled,” she says, accepting the drink immediately.', 'share-dessert': 'One dessert, two forks, and absolutely no agreement about equal portions.', 'riverwalk': 'Outside, the city feels calmer beside the river.', 'goodnight': 'The goodbye lingers just a second longer than necessary.' };
  return lines[choiceId] ?? 'The conversation moves forward with an easy warmth.';
}
