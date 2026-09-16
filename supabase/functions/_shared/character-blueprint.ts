import { canPreviewCharacterBlueprint } from '../../../packages/together-domain/src/character-blueprint.ts';
import { AppError } from './types.ts';

/** Authored records only. Never return session memory, other users' instances or provider credentials. */
export async function loadCharacterBlueprint(db: any, userId: string, continuityId: string, instanceId: string) {
  if (!canPreviewCharacterBlueprint(userId)) throw new AppError('FORBIDDEN','Character blueprint preview is unavailable.',403);
  const instance = await db.from('together_character_instances').select('character_template_id,character_version_id').eq('id',instanceId).eq('user_id',userId).eq('continuity_id',continuityId).maybeSingle();
  if(instance.error)throw new AppError('INTERNAL_ERROR','Character blueprint could not be loaded.',500,true);
  if(!instance.data)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const templateId=instance.data.character_template_id,versionId=instance.data.character_version_id;
  const template=await db.from('together_character_templates').select('id,name,slug,age,occupation,biography,character_role,can_be_selected,can_be_romanced,discovery_metadata,first_meeting,relationship_goal,connection_config,spice_level').eq('id',templateId).is('creator_id',null).maybeSingle();
  if(template.error)throw new AppError('INTERNAL_ERROR','Character blueprint could not be loaded.',500,true);
  if(!template.data)throw new AppError('NOT_FOUND','This preview is for pre-created characters.',404);
  const specs=[
    ['Personality and core instructions',db.from('together_character_versions').select('version,personality_config,values_config,interests,communication_style,appearance_config,voice_config,boundaries,default_social_graph,content_boundaries,visual_identity,pronouns,relationship_config,life_config,character_bible').eq('id',versionId).eq('character_template_id',templateId).maybeSingle()],
    ['Private authored character details',db.from('together_character_private_profiles').select('private_truth,adult_continuity,intimate_anatomy,hidden_sexual').eq('character_version_id',versionId).maybeSingle()],
    ['Authored relationships',db.from('together_character_relationship_edges').select('source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata').or('source_template_id.eq.'+templateId+',target_template_id.eq.'+templateId)],
    ['Private relationship context',db.from('together_character_relationship_private').select('source_template_id,target_template_id,private_tension,knowledge_scope').or('source_template_id.eq.'+templateId+',target_template_id.eq.'+templateId)],
    ['Weekly schedule',db.from('together_schedule_templates').select('day_of_week,start_minute,end_minute,week_index,activity,availability,energy_delta,mood_influence,variation_weight,metadata,together_locations(name,slug)').eq('character_version_id',versionId).order('week_index').order('day_of_week').order('start_minute')],
    ['Activities and preferences',db.from('together_character_activity_templates').select('activity_key,title,category,valid_time_windows,duration_minutes,location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata').eq('character_version_id',versionId)],
    ['Opinions about places',db.from('together_character_place_profiles').select('familiarity,sentiment,confidence,opinion_summary,opinion_tags,preferred_activities,favorite_details,disliked_details,together_locations(name,slug)').eq('character_version_id',versionId)],
    ['Voice direction',db.from('together_character_voice_profiles').select('voice_key,characteristics,active').eq('character_template_id',templateId)],
  ] as const;
  const results=await Promise.all(specs.map(async([title,query])=>{const r=await query;if(r.error)throw new AppError('INTERNAL_ERROR','Character blueprint could not be loaded.',500,true);return {title,data:r.data};}));
  if(!results[0]?.data)throw new AppError('NOT_FOUND','That character version is unavailable.',404);
  const relationshipIds=[...new Set(results.slice(2,4).flatMap(s=>(s.data??[]).flatMap((r:any)=>[r.source_template_id,r.target_template_id])))];
  if(relationshipIds.length){const related=await db.from('together_character_templates').select('id,name').in('id',relationshipIds);if(related.error)throw new AppError('INTERNAL_ERROR','Character relationships could not be loaded.',500,true);const names=new Map((related.data??[]).map((r:any)=>[r.id,r.name]));for(const section of results.slice(2,4))section.data=(section.data??[]).map((r:any)=>({...r,source_character:names.get(r.source_template_id),target_character:names.get(r.target_template_id)}));}
  return {name:template.data.name,version:results[0].data.version,sections:[{title:'Identity and first meeting',data:template.data},...results]};
}
