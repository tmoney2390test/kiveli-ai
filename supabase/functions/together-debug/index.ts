import { z } from 'zod';
import { authenticated } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot } from '../_shared/together.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context.ts';

const schema = z.object({ action: z.enum(['inspect','inspect_context','adjust_relationship','content_inspect','simulate_content']), characterInstanceId: z.string().uuid().optional(), message:z.string().max(4000).optional(), changes: z.record(z.string(), z.number()).optional(), days: z.number().int().min(1).max(30).optional() });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const allowed = (Deno.env.get('TOGETHER_DEBUG_USER_IDS') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!allowed.includes(user.id) && user.app_metadata?.together_internal !== true) throw new AppError('FORBIDDEN', 'Internal build access is required.', 403);
  const input = await parseBody(request, schema);
  if(input.action==='inspect_context'){
    if(!input.characterInstanceId)throw new AppError('VALIDATION_FAILED','Choose a character.',400);
    const[{data:instance},{data:conversation}]=await Promise.all([db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',input.characterInstanceId).eq('user_id',user.id).maybeSingle(),db.from('together_conversations').select('*').eq('character_instance_id',input.characterInstanceId).eq('user_id',user.id).is('archived_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
    if(!instance||!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);
    const lifeRun=await runLifeSimulation({db,userId:user.id,characterInstanceId:instance.id,trigger:'home_opened',evaluateProactive:false});
    const context=await buildKivelleConversationContext({db,userId:user.id,instance,conversation,userMessage:input.message??'What is happening right now?',lifeRun});
    return json({data:{...context,debug:{...context.debug,note:'Credentials, provider secrets, embeddings, and sensitive memories are excluded.'}},correlationId},200,correlationId);
  }
  if (input.action === 'adjust_relationship') {
    if (!input.characterInstanceId || !input.changes) throw new AppError('VALIDATION_FAILED', 'Choose a character and changes.', 400);
    const permitted = ['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'];
    const changes = Object.fromEntries(Object.entries(input.changes).filter(([key]) => permitted.includes(key)).map(([key,value]) => [key, Math.max(0, Math.min(100, Math.round(value)))]));
    const { error } = await db.from('together_relationship_states').update({ ...changes, updated_at: new Date().toISOString() }).eq('character_instance_id', input.characterInstanceId).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Debug adjustment failed.', 500);
  }
  if (input.action === 'simulate_content') {
    if (!input.characterInstanceId) throw new AppError('VALIDATION_FAILED', 'Choose a character to simulate.', 400);
    const days = input.days ?? 1;
    const { data: instance } = await db.from('together_character_instances').select('last_event_simulated_at,last_simulated_at').eq('id', input.characterInstanceId).eq('user_id', user.id).single();
    let cursor = new Date(instance?.last_event_simulated_at ?? instance?.last_simulated_at ?? new Date().toISOString());
    for (let day = 0; day < days; day++) { cursor = new Date(cursor.getTime() + 24 * 3600000); await runLifeSimulation({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now: cursor, evaluateProactive: false, trigger: 'conversation_continued' }); }
  }
  if (input.action === 'content_inspect') {
    const [templates, arcs, activeArcs, usage] = await Promise.all([
      db.from('together_event_templates').select('id,name,category,tone,scale,content_level,probability,significance,active').eq('active', true).order('category').limit(500),
      db.from('together_story_arc_templates').select('slug,title,priority,chapters,cooldown_days').eq('active', true).order('priority'),
      input.characterInstanceId ? db.from('together_story_arc_instances').select('*').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).order('updated_at', { ascending: false }) : Promise.resolve({ data: [] }),
      input.characterInstanceId ? db.from('together_content_usage').select('*').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).order('used_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ]);
    return json({ data: { templates: templates.data ?? [], arcs: arcs.data ?? [], activeArcs: activeArcs.data ?? [], recentUsage: usage.data ?? [] }, correlationId }, 200, correlationId);
  }
  const snapshot = await buildSnapshot(db, user.id);
  return json({ data: { ...snapshot, aiContext: { note: 'Structured context preview. Credentials and provider secrets are intentionally excluded.' } }, correlationId }, 200, correlationId);
});
