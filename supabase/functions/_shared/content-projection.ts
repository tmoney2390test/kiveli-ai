import type { SupabaseClient } from '@supabase/supabase-js';
import { issueAdultAssetUrl, type AdultAccessContext } from './web-adult-access.ts';
import { collapseRestrictedRuns, isSafelyVisible } from '../../../packages/together-domain/src/content-projection.ts';

export type ContentRating='safe'|'suggestive'|'explicit';
export type VisibilityScope='all'|'web_adult';
type Row=Record<string,unknown>;
export type ConversationProjectionAccess={authorizedWebAdult:boolean;authorizedPrivateAdultText:boolean};
type ProjectionAccessInput=boolean|ConversationProjectionAccess;

export function isSafePolicy(row:Row):boolean{return isSafelyVisible(row);}

export function projectConversationRows(rows:Row[],accessInput:ProjectionAccessInput,characterName='your companion'):Row[]{
  const access=normalizeProjectionAccess(accessInput);
  if(access.authorizedWebAdult)return rows;
  return collapseRestrictedRuns(rows.map((row)=>isVisibleTextPolicy(row,access)?stripRestrictedRelations(row,access):row),(run)=>safeBridgeRow(run,characterName),(row)=>isVisibleTextPolicy(row,access));
}

export async function signProjectedAttachments(db:SupabaseClient,rows:Row[],authorizedWebAdult:boolean,security?:{request:Request;access:AdultAccessContext;userId:string}):Promise<Row[]>{
  const paths:string[]=[];
  for(const row of rows){for(const attachment of attachments(row)){if(isSafePolicy(attachment)&&typeof attachment.storage_path==='string')paths.push(attachment.storage_path);}}
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls([...new Set(paths)],900):{data:[]};
  const byPath=new Map<string,string>((signed.data??[]).flatMap((item)=>typeof item.path==='string'&&typeof item.signedUrl==='string'?[[item.path,item.signedUrl] as [string,string]]:[]));
  return Promise.all(rows.map(async(row)=>({...row,together_conversation_attachments:await Promise.all(attachments(row).filter((attachment)=>authorizedWebAdult||isSafePolicy(attachment)).map(async(attachment)=>{
    if(isSafePolicy(attachment))return sanitizeAttachment(attachment,byPath);
    if(!security)return sanitizeAttachment(attachment,new Map());
    const signedUrl=await issueAdultAssetUrl({request:security.request,db,access:security.access,userId:security.userId,attachmentId:String(attachment.id)});
    return sanitizeAttachment(attachment,new Map(),signedUrl);
  }))})));
}

export function safeSearchRows(rows:Row[],accessInput:ProjectionAccessInput):Row[]{const access=normalizeProjectionAccess(accessInput);return access.authorizedWebAdult?rows:rows.filter((row)=>isVisibleTextPolicy(row,access)).map((row)=>stripRestrictedRelations(row,access));}

export function isTrustedPrivateAdultText(row:Row):boolean{
  const metadata=row.provider_metadata&&typeof row.provider_metadata==='object'&&!Array.isArray(row.provider_metadata)?row.provider_metadata as Row:{};
  const version=String(row.moderation_version??metadata.moderationVersion??'');
  const currentPolicy=row.visibility_scope==='all'&&row.content_rating==='explicit'&&
    String(row.moderation_version??metadata.moderationVersion??'')==='private-adult-text-v1'&&
    String(metadata.contentPolicyVersion??'')==='private-adult-text-v1'&&metadata.privacyScope==='private'&&
    metadata.adultEligibilityApplied===true&&metadata.allParticipantsAdults===true&&metadata.safetyDisposition==='allowed';
  if(currentPolicy)return true;
  // Private text written by the original website-only pipeline predates the
  // versioned policy metadata above. These rows were already approved by the
  // server and carry the server-authored neutral bridge. Admit their text only
  // after the conversation-level adult policy has authorized private text;
  // restricted attachments are still removed by signProjectedAttachments.
  const knownBridge=row.safe_bridge==='You and your companion shared a more intimate moment and grew closer.'||
    row.safe_bridge==='You and your companions shared a more intimate moment and grew closer.';
  return row.visibility_scope==='web_adult'&&row.content_rating==='explicit'&&
    (row.role==='user'||row.role==='assistant')&&row.moderation_status==='approved'&&knownBridge&&
    (version==='legacy-adult-route-v1'||version==='web-adult-v1'||version==='private-adult-text-v1');
}

function isVisibleTextPolicy(row:Row,access:ConversationProjectionAccess):boolean{return isSafePolicy(row)||(access.authorizedPrivateAdultText&&isTrustedPrivateAdultText(row));}
function normalizeProjectionAccess(input:ProjectionAccessInput):ConversationProjectionAccess{return typeof input==='boolean'?{authorizedWebAdult:input,authorizedPrivateAdultText:false}:input;}

function safeBridgeRow(run:Row[],characterName:string):Row{
  const first=run[0]??{},last=run[run.length-1]??first;
  const approved=run.map((row)=>typeof row.safe_bridge==='string'?row.safe_bridge.trim():'').find((value)=>value.length>0&&value.length<=500);
  const body=approved??'A portion of this conversation is unavailable in this app.';
  const generic=body==='You and your companion shared a more intimate moment and grew closer.'?`You and ${characterName} shared a more intimate moment and grew closer.`:body;
  return{id:`bridge-${String(first.id??'start')}-${String(last.id??'end')}`,conversation_id:first.conversation_id,conversation_sequence:first.conversation_sequence,role:'system',content:`Private exchange\n\n${generic}`,delivery_status:'complete',moderation_status:'approved',content_rating:'safe',visibility_scope:'all',moderation_version:'safe-bridge-v1',created_at:first.created_at,updated_at:last.updated_at??last.created_at,provider_metadata:{systemEvent:'restricted_bridge'},together_conversation_attachments:[],together_message_reactions:[]};
}

function stripRestrictedRelations(row:Row,access:ConversationProjectionAccess):Row{
  const clone={...row};
  const reply=clone.reply_to_message;if(reply&&typeof reply==='object'&&!Array.isArray(reply)&&!isVisibleTextPolicy(reply as Row,access))clone.reply_to_message=null;
  return clone;
}
function attachments(row:Row):Row[]{const value=row.together_conversation_attachments??row.attachments;return Array.isArray(value)?value.filter((item):item is Row=>Boolean(item)&&typeof item==='object'&&!Array.isArray(item)):[];}
function sanitizeAttachment(attachment:Row,urls:Map<string,string>,adultUrl?:string):Row{const path=typeof attachment.storage_path==='string'?attachment.storage_path:null;const safe:Row={...attachment,signed_url:adultUrl??(path?urls.get(path)??null:null)};delete safe.storage_path;delete safe.analysis_metadata;delete safe.safe_variant_key;return safe;}
