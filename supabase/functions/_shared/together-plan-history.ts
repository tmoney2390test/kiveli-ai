import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

type Row=Record<string,any>;

export type PlanTranscriptRow={
  id:string;
  role:'user'|'assistant';
  content:string;
  created_at:string;
  character_instance_id:string|null;
  speaker_character_instance_id:string|null;
};

export type PlanHistoryMediaRow={
  id:string;
  source:'generated'|'shared';
  signed_url:string;
  created_at:string;
  character_instance_id:string|null;
  message_id:string|null;
  width:number|null;
  height:number|null;
  content_type:string;
};

export function projectPlanTranscript(rows:Row[],limit=500):{messages:PlanTranscriptRow[];truncated:boolean}{
  const visible=rows
    .filter((row)=>['user','assistant'].includes(String(row.role))&&String(row.delivery_status??'complete')==='complete')
    .filter((row)=>String(row.content??'').trim()||messageAttachments(row).some(displayableAttachment))
    .sort((left,right)=>new Date(String(left.created_at)).getTime()-new Date(String(right.created_at)).getTime());
  return{
    truncated:visible.length>limit,
    messages:visible.slice(0,limit).map((row)=>({
      id:String(row.id),
      role:String(row.role) as 'user'|'assistant',
      content:String(row.content??'').trim(),
      created_at:String(row.created_at),
      character_instance_id:nullableString(row.character_instance_id),
      speaker_character_instance_id:nullableString(row.speaker_character_instance_id),
    })),
  };
}

export function projectPlanHistoryMedia(input:{generated:Row[];messages:Row[];signedUrls:Map<string,string>;now?:Date;limit?:number}):PlanHistoryMediaRow[]{
  const now=(input.now??new Date()).getTime(),seen=new Set<string>(),items:PlanHistoryMediaRow[]=[];
  const append=(row:Row,source:'generated'|'shared',messageId?:string|null)=>{
    const path=nullableString(row.storage_path),signedUrl=path?input.signedUrls.get(path):undefined;
    if(!path||!signedUrl||seen.has(path))return;
    if(source==='shared'&&row.expires_at&&new Date(String(row.expires_at)).getTime()<=now)return;
    seen.add(path);
    items.push({
      id:String(row.id),source,signed_url:signedUrl,created_at:String(row.created_at),
      character_instance_id:nullableString(row.character_instance_id),message_id:messageId??nullableString(row.message_id),
      width:nullableNumber(row.width),height:nullableNumber(row.height),content_type:String(row.content_type??row.mime_type??'image/jpeg'),
    });
  };
  input.generated
    .filter((row)=>row.media_type==='image'&&row.status==='ready'&&row.metadata?.hiddenIntermediate!==true)
    .forEach((row)=>append(row,'generated'));
  input.messages.forEach((message)=>messageAttachments(message).filter(displayableAttachment).forEach((attachment)=>append(attachment,'shared',String(message.id))));
  return items.sort((left,right)=>new Date(left.created_at).getTime()-new Date(right.created_at).getTime()).slice(0,input.limit??60);
}

export async function loadPlanHistory(input:{db:SupabaseClient;userId:string;continuityId:string;plan:Row}){
  const{db,userId,continuityId,plan}=input;
  const[{data:scenes,error:sceneError},{data:dates,error:dateError}]=await Promise.all([
    db.from('together_scene_sessions').select('id,conversation_id,started_at,ended_at').eq('shared_plan_id',String(plan.id)).eq('user_id',userId).eq('continuity_id',continuityId).order('started_at'),
    db.from('together_date_sessions').select('id').eq('shared_plan_id',String(plan.id)).eq('user_id',userId).eq('continuity_id',continuityId),
  ]);
  if(sceneError||dateError)throw new AppError('INTERNAL_ERROR','That plan history could not be loaded.',500,true);
  const sceneIds=(scenes??[]).map((row)=>String(row.id)),dateIds=(dates??[]).map((row)=>String(row.id));
  const messageResult=sceneIds.length
    ?await db.from('together_messages').select('id,conversation_id,character_instance_id,speaker_character_instance_id,scene_session_id,scene_sequence,role,content,delivery_status,content_rating,visibility_scope,created_at,together_conversation_attachments(id,message_id,kind,source,storage_path,mime_type,width,height,upload_status,analysis_status,content_rating,visibility_scope,expires_at,storage_deleted_at,created_at)').eq('user_id',userId).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).in('scene_session_id',sceneIds).in('role',['user','assistant']).order('created_at').limit(501)
    :{data:[],error:null};
  const scope=[`shared_plan_id.eq.${String(plan.id)}`];
  if(sceneIds.length)scope.push(`scene_session_id.in.(${sceneIds.join(',')})`);
  if(dateIds.length)scope.push(`date_session_id.in.(${dateIds.join(',')})`);
  const generatedResult=await db.from('together_generated_media').select('id,character_instance_id,message_id,media_type,status,storage_path,width,height,content_type,content_level,content_rating,visibility_scope,metadata,created_at').eq('user_id',userId).eq('continuity_id',continuityId).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).eq('media_type','image').eq('status','ready').in('content_level',['standard','romance']).or(scope.join(',')).order('created_at').limit(80);
  if(messageResult.error||generatedResult.error)throw new AppError('INTERNAL_ERROR','That plan history could not be loaded.',500,true);
  const messages=(messageResult.data??[]) as Row[],generated=(generatedResult.data??[]) as Row[];
  const paths=[...new Set([
    ...generated.map((row)=>nullableString(row.storage_path)),
    ...messages.flatMap((message)=>messageAttachments(message).filter(displayableAttachment).map((attachment)=>nullableString(attachment.storage_path))),
  ].filter((value):value is string=>Boolean(value)))];
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls(paths,3600):{data:[],error:null};
  if(signed.error)throw new AppError('INTERNAL_ERROR','Photos from that plan could not be opened.',500,true);
  const signedUrls=new Map((signed.data??[]).filter((item)=>item.signedUrl).map((item)=>[String(item.path),String(item.signedUrl)]));
  const transcript=projectPlanTranscript(messages);
  return{
    captured_at:nullableString(plan.finalized_at)??nullableString(plan.completed_at)??nullableString((scenes??[]).at(-1)?.ended_at),
    transcript:transcript.messages,
    transcript_truncated:transcript.truncated,
    media:projectPlanHistoryMedia({generated,messages,signedUrls}),
  };
}

function messageAttachments(row:Row):Row[]{return Array.isArray(row.together_conversation_attachments)?(row.together_conversation_attachments as Row[]).filter((item)=>item.visibility_scope==='all'&&['safe','suggestive'].includes(String(item.content_rating??''))):[];}
function displayableAttachment(row:Row){return row.kind==='image'&&row.upload_status==='uploaded'&&!row.storage_deleted_at&&Boolean(row.storage_path);}
function nullableString(value:unknown):string|null{return typeof value==='string'&&value?value:null;}
function nullableNumber(value:unknown):number|null{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
