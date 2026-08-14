export type ConversationTurn={role:'user'|'assistant';content:string;createdAt?:string};

export function summarizeConversation(turns:readonly ConversationTurn[],limit=900):string{
  const meaningful=turns.map((turn)=>({role:turn.role,content:clean(turn.content)})).filter((turn)=>turn.content.length>0).slice(-24);
  if(!meaningful.length)return'';
  const userDetails=meaningful.filter((turn)=>turn.role==='user').map((turn)=>turn.content).slice(-4);
  const characterDetails=meaningful.filter((turn)=>turn.role==='assistant').map((turn)=>turn.content).slice(-3);
  const summary=[userDetails.length?`User shared: ${userDetails.join(' | ')}`:'',characterDetails.length?`Character responded: ${characterDetails.join(' | ')}`:''].filter(Boolean).join('\n');
  return summary.length<=limit?summary:`${summary.slice(0,limit-1).trimEnd()}…`;
}

function clean(value:string):string{return value.replace(/\s+/g,' ').trim().slice(0,280);}
