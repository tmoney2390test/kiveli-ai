import AsyncStorage from '@react-native-async-storage/async-storage';

const writes = new Map<string, Promise<void>>();
function enqueue(key: string, write: () => Promise<void>) {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
  return next;
}
const PREFIX='kivelle:message-draft:v1';
export function messageDraftKey(userId:string,conversationId:string,kind:'direct'|'group'){return`${PREFIX}:${userId}:${kind}:${conversationId}`;}
export async function loadMessageDraft(userId:string,conversationId:string,kind:'direct'|'group'){if(!userId||!conversationId)return'';await writes.get(messageDraftKey(userId,conversationId,kind))?.catch(()=>undefined);return(await AsyncStorage.getItem(messageDraftKey(userId,conversationId,kind)))??'';}
export async function loadMessageDrafts(userId:string,conversations:Array<{id:string;kind:string}>):Promise<Record<string,string>>{
  if(!userId||!conversations.length)return{};
  const keyed=conversations.map((conversation)=>({conversationId:conversation.id,key:messageDraftKey(userId,conversation.id,conversation.kind==='group'?'group':'direct')}));
  try{
    await Promise.all(keyed.map(item=>writes.get(item.key)?.catch(()=>undefined)??Promise.resolve()));
    const values=new Map(await AsyncStorage.multiGet(keyed.map((item)=>item.key)));
    return Object.fromEntries(keyed.flatMap((item)=>{
      const value=values.get(item.key)?.trim();
      return value?[[item.conversationId,value]]:[];
    }));
  }catch{return{};}
}
export async function saveMessageDraft(userId:string,conversationId:string,kind:'direct'|'group',value:string){if(!userId||!conversationId)return;const key=messageDraftKey(userId,conversationId,kind);await enqueue(key,()=>value.trim()?AsyncStorage.setItem(key,value):AsyncStorage.removeItem(key));}
export async function clearMessageDraft(userId:string,conversationId:string,kind:'direct'|'group'){if(userId&&conversationId)await saveMessageDraft(userId,conversationId,kind,'');}
