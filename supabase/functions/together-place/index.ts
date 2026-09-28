import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { resolvePlaceContext, resolveWorldAccess } from '../_shared/together-place.ts';

const id=z.string().uuid();
const fields=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().min(12).max(1000),activities:z.array(z.string().trim().min(2).max(64)).min(1).max(8)});
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('detail'),locationId:id}),
  z.object({action:z.literal('list'),worldId:id.optional()}),
  fields.extend({action:z.literal('create'),worldId:id,parentLocationId:id.optional(),kind:z.enum(['home','other'])}),
  fields.extend({action:z.literal('update'),locationId:id}),
  z.object({action:z.literal('archive'),locationId:id}),
  z.object({action:z.literal('prepare_image'),locationId:id}),
  z.object({action:z.literal('confirm_image'),locationId:id,path:z.string().max(300),width:z.number().int().positive().max(8192),height:z.number().int().positive().max(8192)}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_place_detail',180,3600);
  const body=await parseBody(request,z.union([schema,z.object({locationId:id})]));
  const input='action'in body?body:{...body,action:'detail' as const};
  if(input.action==='list'){
    let query=db.from('together_locations').select('*').eq('owner_user_id',user.id).is('archived_at',null).order('created_at',{ascending:false}).limit(50);
    if(input.worldId)query=query.eq('world_id',input.worldId);
    const{data,error}=await query;
    if(error)throw new AppError('INTERNAL_ERROR','Your places could not be loaded.',500,true);
    return json({data:{places:await signedPlaces(db,data??[])},correlationId},200,correlationId);
  }
  if(input.action==='create'){
    const access=await resolveWorldAccess({db,userId:user.id,worldId:input.worldId});
    if(access==='locked'||access==='available')throw new AppError('NOT_FOUND','That world is unavailable.',404);
    const{count}=await db.from('together_locations').select('id',{count:'exact',head:true}).eq('owner_user_id',user.id).is('archived_at',null);
    if((count??0)>=20)throw new AppError('CONFLICT','You can keep up to 20 personal places. Archive one to add another.',409);
    if(input.parentLocationId){const{data:parent}=await db.from('together_locations').select('id,world_id,location_type,owner_user_id').eq('id',input.parentLocationId).maybeSingle();if(!parent||parent.owner_user_id||parent.world_id!==input.worldId||!['district','neighborhood'].includes(parent.location_type))throw new AppError('VALIDATION_FAILED','Choose a district in this world.',400);}
    const locationId=crypto.randomUUID();
    const place={id:locationId,owner_user_id:user.id,world_id:input.worldId,parent_location_id:input.parentLocationId??null,depth:input.parentLocationId?1:0,name:input.name,slug:`personal-${locationId}`,description:input.description,category:input.kind==='home'?'home':'social',location_type:input.kind==='home'?'residence':'venue',hours:{open:'00:00',close:'00:00'},possible_activities:uniqueActivities(input.activities),metadata:{private:true,directoryVisibility:'private',userCreated:true,kind:input.kind},canonical_visual_context:{canonicalPrompt:input.description,indoorOutdoor:input.kind==='home'?'indoor':'mixed'},canonical_lore:{summary:input.description},sort_order:9999};
    const{data,error}=await db.from('together_locations').insert(place).select('*').single();
    if(error||!data)throw new AppError('INTERNAL_ERROR','Your place could not be saved.',500,true);
    return json({data:{place:data},correlationId},200,correlationId);
  }
  if(input.action==='detail'){
    const place=await resolvePlaceContext({db,locationId:input.locationId,userId:user.id});
    const access=await resolveWorldAccess({db,userId:user.id,worldId:place.world.id});
    if(access==='locked'||access==='available')throw new AppError('NOT_FOUND','That place is unavailable.',404);
    return json({data:{place},correlationId},200,correlationId);
  }
  const{data:owned}=await db.from('together_locations').select('*').eq('id',input.locationId).eq('owner_user_id',user.id).is('archived_at',null).maybeSingle();
  if(!owned)throw new AppError('NOT_FOUND','Your place could not be found.',404);
  if(input.action==='update'){
    const patch={name:input.name,description:input.description,possible_activities:uniqueActivities(input.activities),canonical_visual_context:{canonicalPrompt:input.description,indoorOutdoor:owned.category==='home'?'indoor':'mixed'},canonical_lore:{summary:input.description},updated_at:new Date().toISOString()};
    const{data,error}=await db.from('together_locations').update(patch).eq('id',input.locationId).eq('owner_user_id',user.id).select('*').single();
    if(error||!data)throw new AppError('INTERNAL_ERROR','Your place could not be updated.',500,true);
    return json({data:{place:(await signedPlaces(db,[data]))[0]},correlationId},200,correlationId);
  }
  if(input.action==='archive'){
    const{count:activePlans}=await db.from('together_shared_plans').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('location_id',input.locationId).in('status',['proposed','scheduled','active']);
    if((activePlans??0)>0)throw new AppError('CONFLICT','This place is in an upcoming or active plan. Finish or cancel the plan before archiving it.',409);
    const{error}=await db.from('together_locations').update({archived_at:new Date().toISOString()}).eq('id',input.locationId).eq('owner_user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','Your place could not be archived.',500,true);
    return json({data:{archived:true},correlationId},200,correlationId);
  }
  if(input.action==='prepare_image'){
    const path=`${user.id}/places/${input.locationId}/${crypto.randomUUID()}.jpg`;
    const{data,error}=await db.storage.from('together-user-media').createSignedUploadUrl(path,{upsert:false});
    if(error||!data?.token)throw new AppError('INTERNAL_ERROR','Your image upload could not start.',500,true);
    return json({data:{upload:{bucket:'together-user-media',path,token:data.token}},correlationId},200,correlationId);
  }
  if(input.path.startsWith(`${user.id}/places/${input.locationId}/`)===false||!/\.jpg$/.test(input.path))throw new AppError('VALIDATION_FAILED','That image does not belong to this place.',400);
  const{data:file,error:fileError}=await db.storage.from('together-user-media').download(input.path);
  if(fileError||!file)throw new AppError('VALIDATION_FAILED','Upload the image before saving it.',400);
  if(file.size>10_000_000||file.size<1000)throw new AppError('VALIDATION_FAILED','Choose an image under 10 MB.',400);
  const signature=new Uint8Array(await file.slice(0,3).arrayBuffer());
  if(signature[0]!==0xff||signature[1]!==0xd8||signature[2]!==0xff)throw new AppError('VALIDATION_FAILED','That file is not a JPEG image.',400);
  const sourceKey=`user-place:${input.locationId}`;
  const{data:previous}=await db.from('together_media_reference_assets').select('id,revision').eq('source_key',sourceKey).eq('asset_role','location_canonical').order('revision',{ascending:false}).limit(1);
  const revision=Number(previous?.[0]?.revision??0)+1;
  const{error:referenceError}=await db.from('together_media_reference_assets').insert({asset_role:'location_canonical',location_id:input.locationId,source_key:sourceKey,storage_bucket:'together-user-media',storage_path:input.path,content_type:'image/jpeg',width:input.width,height:input.height,byte_size:file.size,revision,metadata:{ownerUserId:user.id}});
  if(referenceError)throw new AppError('INTERNAL_ERROR','Your image reference could not be saved.',500,true);
  const{data:place,error}=await db.from('together_locations').update({custom_image_path:input.path,updated_at:new Date().toISOString()}).eq('id',input.locationId).eq('owner_user_id',user.id).select('*').single();
  if(error||!place){await db.from('together_media_reference_assets').update({active:false}).eq('source_key',sourceKey).eq('revision',revision);throw new AppError('INTERNAL_ERROR','Your image could not be attached to the place.',500,true);}
  await db.from('together_media_reference_assets').update({active:false}).eq('source_key',sourceKey).eq('asset_role','location_canonical').neq('revision',revision);
  return json({data:{place:(await signedPlaces(db,[place]))[0]},correlationId},200,correlationId);
});

function uniqueActivities(values:string[]){return [...new Set(values.map((value)=>value.trim()).filter(Boolean))];}
async function signedPlaces(db:any,rows:Array<Record<string,any>>){
  const paths=rows.map((row)=>String(row.custom_image_path??'')).filter(Boolean);
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls(paths,3600):{data:[]};
  const urls=new Map((signed.data??[]).map((row:any)=>[String(row.path),String(row.signedUrl)]));
  return rows.map((row)=>({...row,custom_image_url:urls.get(String(row.custom_image_path??''))??null}));
}
