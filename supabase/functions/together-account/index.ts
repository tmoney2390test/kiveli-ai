import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const goals = z.enum(['Dating', 'Friendship', 'Stories', 'Social worlds']);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), displayName: z.string().trim().min(1).max(50), aboutMe: z.string().trim().max(280), interests: z.array(z.string().trim().min(1).max(40)).max(10), goals: z.array(goals).max(4), avatarPath: z.string().max(500).nullable() }),
  z.object({ action: z.literal('privacy'), settings: z.record(z.string(), z.boolean()) }),
  z.object({ action: z.literal('content'), romanceEnabled: z.boolean() }),
  z.object({ action: z.literal('conversation_style'), responseStyle: z.enum(['texting','paragraph']) }),
  z.object({ action: z.literal('export') }),
  z.object({ action: z.literal('delete'), confirmation: z.literal('DELETE') }),
]);

const exportTables = ['together_profiles','together_user_personas','together_continuities','together_character_instances', 'together_relationship_states', 'together_relationship_milestones', 'together_conversations', 'together_messages','together_conversation_attachments', 'together_memories', 'together_open_threads', 'together_life_events','together_shared_plans', 'together_date_sessions', 'together_date_choices', 'together_moments', 'together_story_arc_instances', 'together_knowledge_transfers', 'together_generated_media','together_voice_call_sessions','together_scene_sessions','together_scene_participants','together_scene_messages', 'together_content_usage', 'together_notification_preferences', 'together_entitlements'] as const;

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  await enforceRateLimit(db, user.id, `together_account_${input.action}`, input.action === 'export' ? 4 : 20, 3600);

  if (input.action === 'profile') {
    const { data, error } = await db.from('together_profiles').update({ display_name: input.displayName, about_me: input.aboutMe, interests: input.interests, experience_goals: input.goals, avatar_path: input.avatarPath, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save your profile.', 500, true);
    await track(db, user.id, 'account_profile_updated');
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'privacy') {
    const { data, error } = await db.from('together_profiles').update({ privacy_settings: input.settings, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('privacy_settings').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save privacy settings.', 500, true);
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'content') {
    const { data: profile } = await db.from('together_profiles').select('content_preferences').eq('user_id', user.id).single();
    const current = (profile?.content_preferences ?? {}) as Record<string, unknown>;
    const preferences = { ...current, romanceEnabled: input.romanceEnabled };
    const { data, error } = await db.from('together_profiles').update({ content_preferences: preferences, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('content_preferences').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save content preferences.', 500, true);
    await track(db, user.id, 'content_preferences_updated', { romance_enabled: input.romanceEnabled });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'conversation_style') {
    const { data: profile } = await db.from('together_profiles').select('conversation_preferences').eq('user_id', user.id).single();
    const current = (profile?.conversation_preferences ?? {}) as Record<string, unknown>;
    const previousStyle = current.responseStyle === 'paragraph' ? 'paragraph' : 'texting';
    const conversationPreferences = { ...current, responseStyle: input.responseStyle };
    const { data, error } = await db.from('together_profiles').update({ conversation_preferences: conversationPreferences, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('conversation_preferences').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save conversation style.', 500, true);
    await track(db, user.id, 'conversation_style_changed', { previousStyle, responseStyle: input.responseStyle });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'export') {
    const results = await Promise.all(exportTables.map(async (table) => ({ table, result: await db.from(table).select('*').eq('user_id', user.id) })));
    const failed = results.find(({ result }) => result.error);
    if (failed?.result.error) throw new AppError('INTERNAL_ERROR', 'Your data export could not be prepared.', 500, true);
    const data = Object.fromEntries(results.map(({ table, result }) => [table, result.data ?? []])) as Record<string,Array<Record<string,unknown>>>;
    const{data:createdTemplates}=await db.from('together_character_templates').select('*,together_character_versions(*)').eq('creator_id',user.id);
    const versionIds=(createdTemplates??[]).flatMap((template)=>Array.isArray(template.together_character_versions)?template.together_character_versions.map((version:Record<string,unknown>)=>String(version.id)):[]);
    const[mediaProfiles,referenceAssets]=versionIds.length?await Promise.all([db.from('together_character_media_profiles').select('id,character_version_id,provider,model_family,profile_kind,status,trigger_word,source_revision,source_reference_asset_ids,trained_at,failure_code,compatibility,metadata,created_at,updated_at').in('character_version_id',versionIds),db.from('together_media_reference_assets').select('id,asset_role,character_version_id,source_key,content_type,width,height,revision,active,metadata,created_at,updated_at').in('character_version_id',versionIds)]):[{data:[]},{data:[]}];
    const lives=(data.together_continuities??[]).map((life)=>({continuity:life,persona:(data.together_user_personas??[]).find((persona)=>persona.id===life.persona_id)??null,companions:(data.together_character_instances??[]).filter((instance)=>instance.continuity_id===life.id).map((instance)=>({instance,relationship:(data.together_relationship_states??[]).find((row)=>row.character_instance_id===instance.id)??null,memories:(data.together_memories??[]).filter((row)=>row.character_instance_id===instance.id),plans:(data.together_shared_plans??[]).filter((row)=>row.character_instance_id===instance.id),dates:(data.together_date_sessions??[]).filter((row)=>row.character_instance_id===instance.id),moments:(data.together_moments??[]).filter((row)=>row.character_instance_id===instance.id),stories:(data.together_story_arc_instances??[]).filter((row)=>row.character_instance_id===instance.id),conversations:(data.together_conversations??[]).filter((row)=>row.character_instance_id===instance.id)}))}));
    await track(db, user.id, 'account_data_exported');
    return json({ data: { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email ?? null }, personas:data.together_user_personas??[],lives,createdCharacters:createdTemplates??[],createdCharacterMediaProfiles:mediaProfiles.data??[],createdCharacterReferenceAssets:referenceAssets.data??[],raw:data }, correlationId }, 200, correlationId);
  }

  await removeOwnedMediaForAccount(db,user.id);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new AppError('INTERNAL_ERROR', 'Your account could not be deleted. Please try again.', 500, true);
  return json({ data: { deleted: true }, correlationId }, 200, correlationId);
});

async function removeOwnedMediaForAccount(db:SupabaseClient,userId:string){
  const[generated,attachments,creatorAssets,templates]=await Promise.all([db.from('together_generated_media').select('storage_path').eq('user_id',userId).not('storage_path','is',null),db.from('together_conversation_attachments').select('storage_path').eq('user_id',userId).not('storage_path','is',null),db.from('together_creator_assets').select('storage_path').eq('user_id',userId).not('storage_path','is',null),db.from('together_character_templates').select('id,together_character_versions(id)').eq('creator_id',userId)]);
  const versionIds=(templates.data??[]).flatMap((template)=>Array.isArray(template.together_character_versions)?template.together_character_versions.map((version:Record<string,unknown>)=>String(version.id)):[]);
  const[references,profiles]=versionIds.length?await Promise.all([db.from('together_media_reference_assets').select('storage_bucket,storage_path').in('character_version_id',versionIds),db.from('together_character_media_profiles').select('model_storage_bucket,model_storage_path,metadata').in('character_version_id',versionIds)]):[{data:[]},{data:[]}];
  const byBucket=new Map<string,Set<string>>();const add=(bucket:string,path:unknown)=>{if(typeof path!=='string'||!path)return;const paths=byBucket.get(bucket)??new Set<string>();paths.add(path);byBucket.set(bucket,paths);};
  for(const row of generated.data??[])add('together-user-media',row.storage_path);for(const row of attachments.data??[])add('together-user-media',row.storage_path);for(const row of creatorAssets.data??[])add('kivelle-character-reference',row.storage_path);for(const row of references.data??[])add(String(row.storage_bucket),row.storage_path);for(const row of profiles.data??[]){add(String(row.model_storage_bucket??'kivelle-model-assets'),row.model_storage_path);const metadata=(row.metadata??{}) as Record<string,unknown>;add(String(metadata.trainingArchiveBucket??'kivelle-model-assets'),metadata.trainingArchivePath);}
  for(const[bucket,paths]of byBucket){const values=[...paths];for(let index=0;index<values.length;index+=100){const removal=await db.storage.from(bucket).remove(values.slice(index,index+100));if(removal.error)console.warn(JSON.stringify({level:'warn',operation:'account_storage_cleanup',bucket,count:Math.min(100,values.length-index)}));}}
}
