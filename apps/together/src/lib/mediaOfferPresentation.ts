import type{GeneratedMedia}from'../types';

export function latestMediaOfferPreviewUri(media:GeneratedMedia[],characterInstanceId:string,conversationId:string):string|null{
  const ready=media.filter((item)=>item.media_type==='image'&&item.status==='ready'&&Boolean(item.signed_url)&&item.character_instance_id===characterInstanceId);
  const newest=(items:GeneratedMedia[])=>[...items].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]?.signed_url??null;
  return newest(ready.filter((item)=>item.conversation_id===conversationId))??newest(ready);
}
