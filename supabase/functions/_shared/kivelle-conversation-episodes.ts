import type{SupabaseClient}from'@supabase/supabase-js';
import{buildConversationChapter,buildConversationEpisode,conversationEpisodeSearchText,shouldRetrieveConversationEpisodes,type ConversationChapterSource,type ConversationEpisodeTurn}from'../../../packages/together-domain/src/index.ts';

type Row=Record<string,any>;
const EPISODE_MESSAGE_COUNT=24,MAX_EPISODES_PER_PASS=4,EPISODES_PER_CHAPTER=32,MAX_CHAPTERS_PER_PASS=2;

export type RelevantConversationEpisode={
  id:string;title:string;summary:string;attributedSummary:string;topicTerms:string[];
  startSequence:number;endSequence:number;startMessageId:string;endMessageId:string;
  participantCharacterInstanceIds:string[];createdAt:string;relevance:number;
};

export async function consolidateConversationEpisodes(input:{
  db:SupabaseClient;userId:string;conversationId:string;
  embed?:(text:string)=>Promise<number[]|null>;
}):Promise<{created:number;chaptersCreated:number;throughSequence:number}>{
  const startedAt=Date.now();
  const{data:conversation}=await input.db.from('together_conversations').select('id,user_id,continuity_id,kind').eq('id',input.conversationId).eq('user_id',input.userId).maybeSingle();
  if(!conversation)return{created:0,chaptersCreated:0,throughSequence:0};
  const{data:latest}=await input.db.from('together_conversation_episodes').select('end_sequence').eq('conversation_id',input.conversationId).eq('user_id',input.userId).eq('hierarchy_level',0).eq('status','active').order('end_sequence',{ascending:false}).limit(1).maybeSingle();
  let throughSequence=Number(latest?.end_sequence??0),created=0;
  for(let pass=0;pass<MAX_EPISODES_PER_PASS;pass++){
    const{data,error}=await input.db.from('together_messages').select('id,role,content,created_at,conversation_sequence,speaker_character_instance_id,character_instance_id,provider_metadata').eq('conversation_id',input.conversationId).eq('user_id',input.userId).gt('conversation_sequence',throughSequence).order('conversation_sequence',{ascending:true}).limit(EPISODE_MESSAGE_COUNT);
    if(error||!data||data.length<EPISODE_MESSAGE_COUNT)break;
    const draft=buildConversationEpisode(data.map((message:Row):ConversationEpisodeTurn=>({
      id:String(message.id),role:String(message.role),content:String(message.content??''),createdAt:String(message.created_at),sequence:Number(message.conversation_sequence),
      speakerCharacterInstanceId:message.role==='assistant'?String(message.speaker_character_instance_id??message.character_instance_id??'')||null:null,
      speakerName:message.role==='assistant'&&typeof message.provider_metadata?.speakerName==='string'?message.provider_metadata.speakerName:null,
    })));
    if(!draft)break;
    const embedding=input.embed?await input.embed(conversationEpisodeSearchText(draft)).catch(()=>null):null;
    const{error:insertError}=await input.db.from('together_conversation_episodes').upsert({
      user_id:input.userId,continuity_id:String(conversation.continuity_id),conversation_id:input.conversationId,conversation_kind:String(conversation.kind),
      start_sequence:draft.startSequence,end_sequence:draft.endSequence,start_message_id:draft.startMessageId,end_message_id:draft.endMessageId,message_count:draft.messageCount,
      title:draft.title,summary:draft.summary,attributed_summary:draft.attributedSummary,topic_terms:draft.topicTerms,participant_character_instance_ids:draft.participantCharacterInstanceIds,
      embedding,metadata:{version:1,immutableSourceRange:true},updated_at:new Date().toISOString(),
    },{onConflict:'conversation_id,start_sequence,hierarchy_level',ignoreDuplicates:true});
    if(insertError)break;
    throughSequence=draft.endSequence;created+=1;
  }
  const chaptersCreated=await consolidateConversationChapters({...input,conversation});
  if(created||chaptersCreated)console.log(JSON.stringify({level:'info',operation:'conversation_history_consolidated',conversationId:input.conversationId,episodesCreated:created,chaptersCreated,throughSequence,latencyMs:Date.now()-startedAt}));
  return{created,chaptersCreated,throughSequence};
}

async function consolidateConversationChapters(input:{
  db:SupabaseClient;userId:string;conversationId:string;conversation:Row;
  embed?:(text:string)=>Promise<number[]|null>;
}):Promise<number>{
  const{data:latest}=await input.db.from('together_conversation_episodes').select('end_sequence').eq('conversation_id',input.conversationId).eq('user_id',input.userId).eq('hierarchy_level',1).eq('status','active').order('end_sequence',{ascending:false}).limit(1).maybeSingle();
  let throughSequence=Number(latest?.end_sequence??0),created=0;
  for(let pass=0;pass<MAX_CHAPTERS_PER_PASS;pass++){
    const{data,error}=await input.db.from('together_conversation_episodes').select('id,title,summary,attributed_summary,topic_terms,participant_character_instance_ids,start_sequence,end_sequence,start_message_id,end_message_id,message_count').eq('conversation_id',input.conversationId).eq('user_id',input.userId).eq('hierarchy_level',0).eq('status','active').gt('start_sequence',throughSequence).order('start_sequence',{ascending:true}).limit(EPISODES_PER_CHAPTER);
    if(error||!data||data.length<EPISODES_PER_CHAPTER)break;
    const chapter=buildConversationChapter(data.map((row:Row):ConversationChapterSource=>({
      id:String(row.id),title:String(row.title),summary:String(row.summary),attributedSummary:String(row.attributed_summary),topicTerms:(row.topic_terms??[]).map(String),
      participantCharacterInstanceIds:(row.participant_character_instance_ids??[]).map(String),startSequence:Number(row.start_sequence),endSequence:Number(row.end_sequence),
      startMessageId:String(row.start_message_id),endMessageId:String(row.end_message_id),messageCount:Number(row.message_count),
    })));
    if(!chapter)break;
    const embedding=input.embed?await input.embed(conversationEpisodeSearchText(chapter)).catch(()=>null):null;
    const{error:insertError}=await input.db.from('together_conversation_episodes').upsert({
      user_id:input.userId,continuity_id:String(input.conversation.continuity_id),conversation_id:input.conversationId,conversation_kind:String(input.conversation.kind),hierarchy_level:1,
      start_sequence:chapter.startSequence,end_sequence:chapter.endSequence,start_message_id:chapter.startMessageId,end_message_id:chapter.endMessageId,
      message_count:chapter.messageCount,title:chapter.title,summary:chapter.summary,attributed_summary:chapter.attributedSummary,topic_terms:chapter.topicTerms,
      participant_character_instance_ids:chapter.participantCharacterInstanceIds,source_episode_ids:chapter.sourceEpisodeIds,embedding,
      metadata:{version:1,immutableSourceRange:true,hierarchyLevel:1},updated_at:new Date().toISOString(),
    },{onConflict:'conversation_id,start_sequence,hierarchy_level',ignoreDuplicates:true});
    if(insertError)break;
    throughSequence=chapter.endSequence;created+=1;
  }
  return created;
}

export async function resolveRelevantConversationEpisodes(input:{
  db:SupabaseClient;userId:string;continuityId:string;conversationId:string;userMessage:string;
  queryEmbedding?:number[]|null;minimumSequence?:number;limit?:number;
}):Promise<RelevantConversationEpisode[]>{
  if(!shouldRetrieveConversationEpisodes(input.userMessage))return[];
  const startedAt=Date.now();
  const{data,error}=await input.db.rpc('kivelle_match_conversation_episodes_server',{
    p_user_id:input.userId,p_continuity_id:input.continuityId,p_conversation_id:input.conversationId,p_query:input.userMessage,
    p_embedding:input.queryEmbedding??null,p_min_sequence:Math.max(1,input.minimumSequence??1),p_limit:Math.min(12,Math.max(1,input.limit??8)),
  });
  if(error||!Array.isArray(data))return[];
  const episodes=data.map((row:Row)=>({
    id:String(row.id),title:String(row.title),summary:String(row.summary),attributedSummary:String(row.attributed_summary),topicTerms:(row.topic_terms??[]).map(String),
    startSequence:Number(row.start_sequence),endSequence:Number(row.end_sequence),startMessageId:String(row.start_message_id),endMessageId:String(row.end_message_id),
    participantCharacterInstanceIds:(row.participant_character_instance_ids??[]).map(String),createdAt:String(row.created_at),relevance:Number(row.relevance??0),
  }));
  console.log(JSON.stringify({level:'info',operation:'conversation_history_retrieved',conversationId:input.conversationId,resultCount:episodes.length,semantic:Boolean(input.queryEmbedding),latencyMs:Date.now()-startedAt}));
  return episodes;
}
