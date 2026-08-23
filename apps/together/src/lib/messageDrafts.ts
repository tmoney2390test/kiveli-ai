import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX='kivelle:message-draft:v1';
export function messageDraftKey(userId:string,conversationId:string,kind:'direct'|'group'){return`${PREFIX}:${userId}:${kind}:${conversationId}`;}
export async function loadMessageDraft(userId:string,conversationId:string,kind:'direct'|'group'){if(!userId||!conversationId)return'';return(await AsyncStorage.getItem(messageDraftKey(userId,conversationId,kind)))??'';}
export async function saveMessageDraft(userId:string,conversationId:string,kind:'direct'|'group',value:string){if(!userId||!conversationId)return;const key=messageDraftKey(userId,conversationId,kind);if(value.trim())await AsyncStorage.setItem(key,value);else await AsyncStorage.removeItem(key);}
export async function clearMessageDraft(userId:string,conversationId:string,kind:'direct'|'group'){if(userId&&conversationId)await AsyncStorage.removeItem(messageDraftKey(userId,conversationId,kind));}
