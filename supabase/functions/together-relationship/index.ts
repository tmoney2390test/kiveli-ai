import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot, clampRelationship, track } from '../_shared/together.ts';
import {activeContinuity}from'../_shared/together-continuity.ts';

const schema = z.object({ milestoneId: z.string().uuid(), action: z.enum(['accept','defer','stay_friends','talk_it_out','give_space']) });
const stageOrder = ['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_relationship', 40, 3600);
  const input = await parseBody(request, schema);
  const continuity=await activeContinuity(db,user.id);const { data: milestone } = await db.from('together_relationship_milestones').select('*').eq('id', input.milestoneId).eq('user_id', user.id).eq('continuity_id',continuity.id).maybeSingle();
  if (!milestone) throw new AppError('NOT_FOUND', 'That relationship moment is no longer available.', 404);
  if (milestone.status !== 'pending') throw new AppError('CONFLICT', 'That choice has already been handled.', 409);
  const choices = Array.isArray(milestone.choices) ? milestone.choices as Array<{ id?: string }> : [];
  if (!choices.some((choice) => choice.id === input.action)) throw new AppError('VALIDATION_FAILED', 'That choice is not available for this moment.', 400);

  const now = new Date();
  if (input.action === 'defer') {
    await db.from('together_relationship_milestones').update({ status: 'deferred', chosen_action: input.action, deferred_until: new Date(now.getTime() + 3 * 86400000).toISOString(), resolved_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', milestone.id).eq('status', 'pending');
    await track(db, user.id, 'relationship_milestone_deferred', { milestoneId: milestone.id, kind: milestone.kind });
    return json({ data: { snapshot: await buildSnapshot(db, user.id) }, correlationId }, 200, correlationId);
  }

  const { data: instance } = await db.from('together_character_instances').select('*').eq('id', milestone.character_instance_id).eq('user_id', user.id).maybeSingle();
  const { data: relationship } = await db.from('together_relationship_states').select('*').eq('character_instance_id', milestone.character_instance_id).eq('user_id', user.id).maybeSingle();
  if (!instance || !relationship) throw new AppError('NOT_FOUND', 'That relationship is unavailable.', 404);
  if (String(instance.relationship_stage) !== String(milestone.from_stage)) throw new AppError('CONFLICT', 'Your relationship has already moved beyond this moment.', 409);

  let nextStage = String(instance.relationship_stage);
  if (input.action === 'accept' && milestone.to_stage) {
    const from = stageOrder.indexOf(nextStage);
    const to = stageOrder.indexOf(String(milestone.to_stage));
    if (from < 0 || to - from !== 1) throw new AppError('VALIDATION_FAILED', 'That relationship transition is not allowed.', 400);
    nextStage = String(milestone.to_stage);
  }

  if (milestone.kind === 'repair') {
    const change = input.action === 'talk_it_out' ? { conflict: -8, trust: 2, respect: 2, comfort: 1 } : { conflict: -2, respect: 1 };
    const next = clampRelationship(relationship, change, 8);
    await db.from('together_relationship_states').update({ ...next, active_major_conflict: input.action === 'talk_it_out' ? Number(next.conflict??relationship.conflict??0) > 45 : relationship.active_major_conflict, recent_direction: input.action === 'talk_it_out' ? 'repairing' : 'steady', updated_at: now.toISOString() }).eq('character_instance_id', instance.id);
  }

  if (milestone.kind === 'first_date_invitation' && input.action === 'accept') {
    const dateTemplateId=String((milestone.metadata as Record<string,unknown>|null)?.date_template_id??'');
    if(!dateTemplateId)throw new AppError('CONFLICT','The shared experience for this milestone is no longer available.',409);
    const { data: date } = await db.from('together_date_sessions').update({ status: 'unlocked', updated_at: now.toISOString() }).eq('user_id', user.id).eq('character_instance_id', instance.id).eq('date_template_id', dateTemplateId).in('status', ['locked','deferred']).select('id').maybeSingle();
    if (date) await track(db, user.id, 'date_unlocked', { dateSessionId: date.id, source: 'relationship_milestone' });
  }

  if (nextStage !== instance.relationship_stage || milestone.kind === 'keep_in_touch') {
    await db.from('together_character_instances').update({ relationship_stage: nextStage, contact_added_at: milestone.kind === 'keep_in_touch' ? (instance.contact_added_at ?? now.toISOString()) : instance.contact_added_at, updated_at: now.toISOString() }).eq('id', instance.id).eq('user_id', user.id);
  }
  if (nextStage !== instance.relationship_stage) await db.from('together_relationship_states').update({ recent_direction: 'improving', updated_at: now.toISOString() }).eq('character_instance_id', instance.id).eq('user_id', user.id);
  const status = input.action === 'stay_friends' ? 'declined' : 'accepted';
  await db.from('together_relationship_milestones').update({ status, chosen_action: input.action, resolved_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', milestone.id).eq('status', 'pending');
  await track(db, user.id, 'relationship_milestone_resolved', { milestoneId: milestone.id, kind: milestone.kind, action: input.action });
  if (milestone.kind === 'keep_in_touch' && input.action === 'accept') await track(db, user.id, 'character_contact_added', { characterInstanceId: instance.id, source: 'milestone_choice' });
  if (nextStage !== instance.relationship_stage) await track(db, user.id, 'relationship_stage_changed', { characterInstanceId: instance.id, from: instance.relationship_stage, to: nextStage, source: 'milestone_choice' });
  return json({ data: { snapshot: await buildSnapshot(db, user.id) }, correlationId }, 200, correlationId);
});
