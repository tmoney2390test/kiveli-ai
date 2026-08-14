import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { TOGETHER_IDS, track } from '../_shared/together.ts';

const schema = z.object({ action: z.enum(['preview','accept','complete']), choice: z.string().max(120).optional() });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_introduction', 30, 3600);
  const input = await parseBody(request, schema);
  const { data: instances } = await db.from('together_character_instances').select('*').eq('user_id', user.id).in('character_template_id', [TOGETHER_IDS.maya, TOGETHER_IDS.chloe]);
  const maya = instances?.find((item) => item.character_template_id === TOGETHER_IDS.maya);
  const chloe = instances?.find((item) => item.character_template_id === TOGETHER_IDS.chloe);
  if (!maya || !chloe) throw new AppError('NOT_FOUND', 'The introduction is not available.', 404);
  if (input.action === 'preview') return json({ data: { available: Boolean(maya.contact_added_at), completed: Boolean(chloe.introduced_at), title: 'Maya wants to introduce you to Chloe', line: '“Chloe, you have to meet them. They’re the reason I finally tried the spicy ramen challenge.”' }, correlationId }, 200, correlationId);
  if (!maya.contact_added_at) throw new AppError('CONFLICT', 'Get to know Maya before meeting her friends.', 409);
  if (input.action === 'accept') {
    await track(db, user.id, 'character_introduction_started', { character: 'chloe' });
    return json({ data: { phase: 1, totalPhases: 6, maya: 'Chloe, you have to meet them.', chloe: 'So you’re the mysterious person behind all the sudden sushi opinions.' }, correlationId }, 200, correlationId);
  }
  const now = new Date().toISOString();
  await db.from('together_character_instances').update({ introduced_at: now, contact_added_at: now, relationship_stage: 'acquaintance', current_location_id: TOGETHER_IDS.juniper, current_activity: 'meeting you through Maya', current_mood: 'curious', updated_at: now }).eq('id', chloe.id);
  const { data: event, error: eventError } = await db.from('together_life_events').insert({ user_id: user.id, character_instance_id: maya.id, event_type: 'introduction', title: 'Maya introduces Chloe', narrative_summary: 'Maya introduced the user to her close friend Chloe at Juniper Café.', participant_instance_ids: [maya.id, chloe.id], location_id: TOGETHER_IDS.juniper, significance: .9, starts_at: now, resulting_state_changes: { chloeContactAdded: true }, user_should_know: true, proactive_message_appropriate: false }).select('id').single();
  if (eventError || !event) throw new AppError('INTERNAL_ERROR', 'The introduction could not be completed.', 500, true);
  const { data: conversation } = await db.from('together_conversations').insert({ user_id: user.id, character_instance_id: chloe.id, kind: 'introduction', title: 'Meeting Chloe', last_message_at: now }).select('*').single();
  await db.from('together_messages').insert({ conversation_id: conversation.id, user_id: user.id, character_instance_id: chloe.id, role: 'assistant', content: 'Okay, Maya has told me exactly enough to make me curious and not enough to make any of it useful. Hi—I’m Chloe.', delivery_status: 'complete' });
  const { data: shareable } = await db.from('together_memories').select('id').eq('character_instance_id', maya.id).eq('user_id', user.id).eq('status', 'active').eq('sensitivity_category', 'none').gte('importance', .7).limit(1).maybeSingle();
  if (shareable) await db.from('together_knowledge_transfers').insert({ user_id: user.id, memory_id: shareable.id, from_character_instance_id: maya.id, to_character_instance_id: chloe.id, life_event_id: event.id, reason: 'Maya naturally shared a non-sensitive detail during the explicit introduction.' });
  await db.from('together_relationship_states').update({ trust: 10, comfort: 10, affinity: 12, familiarity: 8, updated_at: now }).eq('character_instance_id', chloe.id);
  await db.from('together_moments').insert({ user_id: user.id, character_instance_id: maya.id, title: 'Meeting Chloe', occurred_at: now, location_id: TOGETHER_IDS.juniper, summary: 'Maya introduced you to Chloe, turning City Life into something bigger than a one-on-one story.', participant_instance_ids: [maya.id, chloe.id], relationship_impact: { familiarity: 3 }, media: [{ asset: 'chloe-portrait' }], moment_type: 'introduction' });
  await track(db, user.id, 'character_introduction_completed', { character: 'chloe' });
  return json({ data: { conversation, chloe: { ...chloe, introduced_at: now, contact_added_at: now }, eventId: event.id }, correlationId }, 201, correlationId);
});
