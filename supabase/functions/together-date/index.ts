import { z } from 'zod';
import { createMediaOffer } from '../_shared/together-media-offers.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { clampRelationship, nextDatePhase, relationshipMetrics, track } from '../_shared/together.ts';
import { dateChoiceImpact } from '../../../packages/together-domain/src/index.ts';
import { waitUntil } from '../_shared/background.ts';
import {activeContinuity}from'../_shared/together-continuity.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action:z.literal('availability'),characterInstanceId:z.string().uuid(),worldId:z.string().uuid() }),
  z.object({ action: z.literal('start'), sessionId: z.string().uuid() }),
  z.object({ action: z.literal('defer'), sessionId: z.string().uuid() }),
  z.object({ action: z.literal('choose'), sessionId: z.string().uuid(), choiceId: z.string().min(1).max(80), choiceText: z.string().min(1).max(1000), freeText: z.boolean().optional() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_date', 80, 3600);
  const input = await parseBody(request, schema);
  const continuity=await activeContinuity(db,user.id);
  if(input.action==='availability'){
    const[{data:instance},{data:relationship},{data:templates},{data:sessions}]=await Promise.all([
      db.from('together_character_instances').select('id,relationship_stage').eq('id',input.characterInstanceId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle(),
      db.from('together_relationship_states').select('*').eq('character_instance_id',input.characterInstanceId).eq('user_id',user.id).maybeSingle(),
      db.from('together_date_templates').select('*').eq('world_id',input.worldId).eq('active',true).order('created_at'),
      db.from('together_date_sessions').select('*').eq('character_instance_id',input.characterInstanceId).eq('user_id',user.id).eq('continuity_id',continuity.id),
    ]);
    if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
    const byTemplate=new Map((sessions??[]).map((session:Record<string,unknown>)=>[String(session.date_template_id),session]));
    const availability=(templates??[]).map((template:Record<string,unknown>)=>{const session=byTemplate.get(String(template.id));const available=dateRulesPass(template.unlock_rules as Record<string,unknown>|undefined,{...relationship,relationship_stage:instance.relationship_stage});return{template,sessionId:session?.id??null,status:session?.status??(available?'available':'locked')};});
    return json({data:availability,correlationId},200,correlationId);
  }
  const { data: session } = await db.from('together_date_sessions').select('*,together_date_templates(*)').eq('id', input.sessionId).eq('user_id', user.id).eq('continuity_id',continuity.id).maybeSingle();
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
  const phases = session.together_date_templates.phases as Array<{ id: string; narrativeSeed?:string; choices: Array<{ id: string; label: string; relationshipImpact?:Record<string,number>; resultSeed?:string }> }>;
  const phase = phases.find((item) => item.id === session.current_phase);
  const authoredChoice=phase?.choices.find((choice)=>choice.id===input.choiceId);
  const isFreeText = input.choiceId === 'say_something' && input.freeText === true;
  if (!isFreeText && !authoredChoice) throw new AppError('VALIDATION_FAILED', 'That choice is not available in this scene.', 400);
  const impact = authoredChoice?.relationshipImpact??dateChoiceImpact(input.choiceId);
  const narrativeResult=authoredChoice?.resultSeed??phase?.narrativeSeed??'The shared experience moves forward in a way that reflects the choice.';
  const { error: choiceError } = await db.from('together_date_choices').insert({ date_session_id: session.id, user_id: user.id, phase: session.current_phase, choice_id: input.choiceId, choice_text: input.choiceText, relationship_impact: impact, narrative_result: narrativeResult });
  if (choiceError?.code === '23505') throw new AppError('CONFLICT', 'You already chose in this scene.', 409);
  if (choiceError) throw new AppError('INTERNAL_ERROR', 'Could not save that choice.', 500, true);
  const next = nextDatePhase(session.current_phase, phases);
  const state = { ...(session.state ?? {}), [session.current_phase]: isFreeText ? { choice: input.choiceId, text: input.choiceText } : input.choiceId };
  if (!next.completed) {
    const { data } = await db.from('together_date_sessions').update({ current_phase: next.phase, phase_index: next.index, state, updated_at: new Date().toISOString() }).eq('id', session.id).select('*,together_date_templates(*)').single();
    return json({ data: { session: data, narrative: narrativeResult, completed: false }, correlationId }, 200, correlationId);
  }
  const completedAt = new Date().toISOString();
  const templateName = String(session.together_date_templates.name ?? 'Shared date');
  const {data:dateChoices}=await db.from('together_date_choices').select('phase,choice_id,choice_text,narrative_result,relationship_impact').eq('date_session_id',session.id).eq('user_id',user.id).order('created_at');
  const highlights=(dateChoices??[]).map((choice)=>choice.narrative_result??choice.choice_text).filter(Boolean).slice(0,4);
  const summary=highlights.length?`During ${templateName}, ${highlights.join(' ')}`:`You and your companion shared ${templateName}, making choices that shaped the evening.`;
  const enrichedState={...state,summary,highlights,choices:(dateChoices??[]).map((choice)=>({phase:choice.phase,id:choice.choice_id,label:choice.choice_text,narrative:choice.narrative_result}))};
  await db.from('together_date_sessions').update({ status: 'completed', current_phase: next.phase, phase_index: next.index, state:enrichedState, completed_at: completedAt, updated_at: completedAt }).eq('id', session.id);
  const { data: relation } = await db.from('together_relationship_states').select('*').eq('character_instance_id', session.character_instance_id).single();
  const { data: characterInstance } = await db.from('together_character_instances').select('relationship_stage').eq('id', session.character_instance_id).eq('user_id', user.id).maybeSingle();
  const totalImpact=Object.fromEntries(relationshipMetrics.map((metric)=>[metric,Math.max(-8,Math.min(8,(dateChoices??[]).reduce((sum,choice)=>sum+Number((choice.relationship_impact as Record<string,unknown>|null)?.[metric]??0),0))) ]));
  const changed = clampRelationship(relation ?? {}, totalImpact, 8);
  await db.from('together_relationship_states').update({ ...changed, recent_direction: 'improving', updated_at: completedAt }).eq('character_instance_id', session.character_instance_id);
  const completionEffects=(session.together_date_templates.metadata as Record<string,unknown>|null)?.completion_effects as Record<string,unknown>|undefined;
  if(completionEffects?.relationship_stage)await db.from('together_character_instances').update({ relationship_stage: completionEffects.relationship_stage, updated_at: completedAt }).eq('id', session.character_instance_id).in('relationship_stage', ['friend','flirting']);
  const { data: memory } = await db.from('together_memories').upsert({ user_id: user.id, character_instance_id: session.character_instance_id, memory_type: 'episodic', canonical_text: summary, dedupe_key: `episodic:${session.date_template_id}`, importance: .96, confidence: 1, sensitivity_category: 'none', status: 'active', metadata: { dateSessionId: session.id, dateTemplateId: session.date_template_id, choices: enrichedState.choices, highlights } }, { onConflict: 'character_instance_id,dedupe_key' }).select('id').single();
  const locationId=session.together_date_templates.location_id;
  if(!locationId)throw new AppError('CONFLICT','This experience is missing its canonical location.',409);
  const { data: moment } = await db.from('together_moments').insert({ user_id: user.id, character_instance_id: session.character_instance_id, title: templateName, occurred_at: completedAt, location_id: locationId, summary, participant_instance_ids: [session.character_instance_id], linked_memory_ids: memory ? [memory.id] : [], relationship_impact: totalImpact, relationship_stage_at_creation: characterInstance?.relationship_stage ?? null, date_session_id: session.id, media: [], moment_type: 'date' }).select('*').single();
  await track(db, user.id, 'date_completed', { dateSessionId: session.id });
  if (moment) await track(db, user.id, 'moment_created', { momentId: moment.id, type: 'date' });
  if(moment)waitUntil(createMediaOffer(db,{userId:user.id,characterInstanceId:session.character_instance_id,source:'date',dateSessionId:session.id,momentId:moment.id,offerKey:`date:${session.id}:completion`,title:`A photo from ${templateName}`,contentLevel:'romance',previewMetadata:{dateTitle:templateName,locationId}}).catch((error)=>{console.warn('Together date photo offer unavailable',error instanceof Error?error.message:'unknown_error');return null;}));
  return json({ data: { session: { ...session, status: 'completed', current_phase: next.phase, phase_index: next.index, state:enrichedState, completed_at: completedAt }, narrative: String(completionEffects?.result_seed??'The experience settles into shared history.'), completed: true, moment }, correlationId }, 200, correlationId);
});

function dateRulesPass(rules:Record<string,unknown>|undefined,state:Record<string,unknown>){const order=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];if(!rules)return true;const stage=String(state.relationship_stage??'stranger'),minimum=String(rules.min_stage??'stranger');if(order.indexOf(stage)<order.indexOf(minimum))return false;for(const[key,value]of Object.entries(rules)){if(!key.startsWith('min_')||key==='min_stage')continue;const metric=key.slice(4);if(Number(state[metric]??0)<Number(value))return false;}return true;}
