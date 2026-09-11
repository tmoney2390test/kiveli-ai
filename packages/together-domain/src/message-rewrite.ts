/** A rewrite changes one existing reply, never the conversation's tail. */
export type RewriteMessage = {
  id: string;
  role: string;
  content: string;
  delivery_status?: string | null;
  provider_metadata?: {uiHidden?:boolean;mediaOnly?:boolean;characterDead?:boolean;rewriteVersion?:number;[key:string]:unknown} | null;
};

export function canRewriteMessage(target: RewriteMessage, messages: RewriteMessage[]): boolean {
  if (target.role !== 'assistant' || target.delivery_status !== 'complete' ||
    target.id.startsWith('local') || !target.content.trim() || target.content === '[Photo]' ||
    target.provider_metadata?.uiHidden || target.provider_metadata?.mediaOnly ||
    target.provider_metadata?.characterDead) return false;
  const tail = messages.filter(message => !message.provider_metadata?.uiHidden).at(-1);
  return tail?.id === target.id;
}

export function messageRewriteVersion(message: RewriteMessage): number {
  const version = message.provider_metadata?.rewriteVersion;
  return typeof version==='number' && Number.isSafeInteger(version) && version >= 0 ? version : 0;
}
