import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { CALDERS_WORLD_ID, filterAccessibleLocations, loadWorldProgress } from '../_shared/kivelle-world-progress.ts';
import { resolveWorldAccess } from '../_shared/together-place.ts';
import { applyCalderStoryAction, calderStoryView, type CalderArc } from '../../../packages/together-domain/src/calders-stories.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('library')}),
  z.object({action:z.literal('choose'),expectedVersion:z.number().int().min(0),requestId:z.string().uuid(),choice:z.object({type:z.enum(['start','advance','pause','resume','resolve','investigate']),arcSlug:z.string().min(1).max(100),choiceId:z.string().max(120).optional(),returnAt:z.string().datetime().optional(),locationId:z.string().uuid().optional()})}),
]);
serve(async(request,correlationId)=>{
  const {user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'world_story',120,3600);
  const input=await parseBody(request,schema),continuity=await activeContinuity(db,user.id);
  const {data:world}=await db.from('together_worlds').select('id').eq('id',CALDERS_WORLD_ID).eq('published',true).maybeSingle();
  if(!world)throw new AppError('NOT_FOUND','This world is not available yet.',404);
  const access=await resolveWorldAccess({db,userId:user.id,worldId:CALDERS_WORLD_ID});
  if(access==='locked'||access==='available')throw new AppError('FORBIDDEN','Unlock this world to follow its stories.',403);
  const [{data:rows,error},progress]=await Promise.all([
    db.from('together_world_canon_sources').select('payload').eq('world_id',CALDERS_WORLD_ID).eq('content_type','story_arc'),
    loadWorldProgress(db,user.id,CALDERS_WORLD_ID,continuity.id),
  ]);
  if(error)throw new AppError('INTERNAL_ERROR','The stories could not be loaded.',500,true);
  const arcs=(rows??[]).map(row=>row.payload as CalderArc);
  // A clue must be offered in an actual scene with its holder. Familiarity alone does not open a desk.
  const {data:scenes,error:sceneError}=await db.from('together_scene_sessions').select('location_id,character_instance_id,state,started_at,expected_end_at,together_character_instances(character_template_id)').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('world_id',CALDERS_WORLD_ID).is('ended_at',null);
  if(sceneError)throw new AppError('INTERNAL_ERROR','Your current scene could not be loaded.',500,true);
  const eligibleEvidenceIds=arcs.flatMap(arc=>arc.clues.filter(clue=>(scenes??[]).some(scene=>{
    const instance=Array.isArray(scene.together_character_instances)?scene.together_character_instances[0]:scene.together_character_instances;
    const expires=scene.expected_end_at?Date.parse(scene.expected_end_at):Date.parse(scene.started_at)+3*3600000;
    return expires>Date.now()&&instance?.character_template_id===clue.holderCharacterId&&(clue.portable===true||scene.location_id===clue.originLocationId)&&progress.state.arcs?.[arc.slug]?.status==='active'&&progress.state.arcs[arc.slug].stage>=2;
  })).map(clue=>clue.id));
  const {data:places}=await db.from('together_locations').select('id,name,world_id,location_type,access_metadata').eq('world_id',CALDERS_WORLD_ID).eq('location_type','district');
  const newBases=await filterAccessibleLocations(db,user.id,places??[]);
  const view=(state:typeof progress.state,version:number)=>({version,newBases:newBases.map(p=>({id:p.id,name:p.name})),stories:calderStoryView(arcs,state,eligibleEvidenceIds)});
  if(input.action==='library')return json({data:view(progress.state,progress.version),correlationId},200,correlationId);
  const {data:prior}=await db.from('together_world_progress_actions').select('result').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('world_id',CALDERS_WORLD_ID).eq('request_id',input.requestId).maybeSingle();
  if(prior)return json({data:prior.result,correlationId},200,correlationId);
  if(progress.version!==input.expectedVersion)throw new AppError('CONFLICT','Your story changed in another window. Refresh to continue.',409);
  if(['advance','resolve'].includes(input.choice.type)){
    const arc=arcs.find(arc=>arc.slug===input.choice.arcSlug);
    const present=(scenes??[]).some(scene=>{
      const instance=Array.isArray(scene.together_character_instances)?scene.together_character_instances[0]:scene.together_character_instances;
      const expires=scene.expected_end_at?Date.parse(scene.expected_end_at):Date.parse(scene.started_at)+3*3600000;
      return expires>Date.now()&&arc?.characterIds.includes(instance?.character_template_id)&&arc.locationIds.includes(scene.location_id);
    });
    if(!present)throw new AppError('CONFLICT','Meet someone involved at a story location to continue this chapter.',409);
  }
  let next;
  try{next=applyCalderStoryAction({arcs,state:progress.state,action:input.choice,eligibleEvidenceIds,allowedRelocationIds:newBases.map(p=>String(p.id))});}catch(error){throw new AppError('CONFLICT',error instanceof Error?error.message:'That choice is unavailable.',409);}
  const result=view(next,progress.version+1);
  const committed=await db.rpc('kivelle_commit_world_progress',{p_user_id:user.id,p_continuity_id:continuity.id,p_world_id:CALDERS_WORLD_ID,p_expected_version:progress.version,p_request_id:input.requestId,p_state:next,p_result:result});
  if(committed.error)throw new AppError('CONFLICT','Your story changed in another window. Refresh to continue.',409);
  return json({data:committed.data,correlationId},200,correlationId);
});
