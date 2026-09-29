import type{GeneratedMedia}from'../types';
import { latestConversationHeaderImage } from './chatHeaderMedia';

export function latestMediaOfferPreviewUri(media:GeneratedMedia[],characterInstanceId:string,conversationId:string):string|null{
  return latestConversationHeaderImage(media.filter((item)=>item.character_instance_id===characterInstanceId),conversationId)?.signed_url??null;
}
