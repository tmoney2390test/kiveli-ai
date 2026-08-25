import { formatRollingConversationState, mergeRollingConversationState } from './conversation-state.ts';

export type ConversationEpisodeTurn={
  id:string;
  role:string;
  content:string;
  createdAt:string;
  sequence:number;
  speakerCharacterInstanceId?:string|null;
  speakerName?:string|null;
};

export type ConversationEpisodeDraft={
  title:string;
  summary:string;
  attributedSummary:string;
  topicTerms:string[];
  participantCharacterInstanceIds:string[];
  startSequence:number;
  endSequence:number;
  startMessageId:string;
  endMessageId:string;
  messageCount:number;
};

export type ConversationChapterSource=ConversationEpisodeDraft&{id:string};
export type ConversationChapterDraft=ConversationEpisodeDraft&{sourceEpisodeIds:string[]};

const stopWords=new Set(['about','after','again','also','and','are','because','been','before','but','can','could','did','does','for','from','had','has','have','her','here','him','his','how','into','just','like','more','not','our','out','really','said','she','that','the','their','them','then','there','they','this','through','too','user','very','was','were','what','when','where','which','who','why','will','with','would','you','your']);

/**
 * Creates a deterministic, source-addressable episode. The full transcript is
 * intentionally retained separately and remains canonical.
 */
export function buildConversationEpisode(turns:readonly ConversationEpisodeTurn[]):ConversationEpisodeDraft|null{
  const meaningful=turns.filter((turn)=>turn.id&&Number.isFinite(turn.sequence)&&turn.sequence>0&&turn.content.trim().length>0).sort((left,right)=>left.sequence-right.sequence);
  if(!meaningful.length)return null;
  const topicTerms=rankTerms(meaningful.map((turn)=>turn.content).join(' '),8);
  const rolling=mergeRollingConversationState('',meaningful.map((turn)=>({id:turn.id,role:turn.role,content:turn.content,createdAt:turn.createdAt})),new Date(meaningful.at(-1)!.createdAt));
  const attributedLines=meaningful.map((turn)=>`${speakerLabel(turn)}: ${compact(turn.content,280)}`);
  const participantCharacterInstanceIds=[...new Set(meaningful.map((turn)=>turn.speakerCharacterInstanceId??'').filter(Boolean))];
  return{
    title:topicTerms.length?`Conversation about ${topicTerms.slice(0,3).join(', ')}`:'Conversation episode',
    summary:formatRollingConversationState(rolling).slice(0,2_600),
    attributedSummary:attributedLines.join('\n').slice(0,7_000),
    topicTerms,
    participantCharacterInstanceIds,
    startSequence:meaningful[0]!.sequence,
    endSequence:meaningful.at(-1)!.sequence,
    startMessageId:meaningful[0]!.id,
    endMessageId:meaningful.at(-1)!.id,
    messageCount:meaningful.length,
  };
}

export function conversationEpisodeSearchText(episode:Pick<ConversationEpisodeDraft,'title'|'summary'|'attributedSummary'>):string{
  return`${episode.title}\n${episode.summary}\n${episode.attributedSummary}`.slice(0,8_000);
}

export function buildConversationChapter(episodes:readonly ConversationChapterSource[]):ConversationChapterDraft|null{
  const ordered=[...episodes].filter((episode)=>episode.id&&episode.startSequence>0&&episode.endSequence>=episode.startSequence).sort((left,right)=>left.startSequence-right.startSequence);
  if(!ordered.length)return null;
  const topicCounts=new Map<string,number>();
  for(const term of ordered.flatMap((episode)=>episode.topicTerms)){topicCounts.set(term,(topicCounts.get(term)??0)+1);}
  const topicTerms=[...topicCounts].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0])).slice(0,12).map(([term])=>term);
  const first=ordered[0]!,last=ordered.at(-1)!;
  return{
    title:topicTerms.length?`Conversation chapter about ${topicTerms.slice(0,4).join(', ')}`:'Conversation chapter',
    summary:ordered.map((episode)=>`${episode.title}: ${episode.summary}`).join('\n').slice(0,12_000),
    attributedSummary:ordered.map((episode)=>`Messages ${episode.startSequence}–${episode.endSequence}: ${episode.attributedSummary.slice(-420)}`).join('\n').slice(0,14_000),
    topicTerms,
    participantCharacterInstanceIds:[...new Set(ordered.flatMap((episode)=>episode.participantCharacterInstanceIds))],
    startSequence:first.startSequence,endSequence:last.endSequence,startMessageId:first.startMessageId,endMessageId:last.endMessageId,
    messageCount:ordered.reduce((total,episode)=>total+episode.messageCount,0),sourceEpisodeIds:ordered.map((episode)=>episode.id),
  };
}

export function shouldRetrieveConversationEpisodes(message:string):boolean{
  const clean=message.trim();
  if(clean.length<4)return false;
  if(/\b(?:remember|forgot|remind|last time|before|our first|used to|history|you told me|i told you|that time|back when)\b/i.test(clean))return true;
  return clean.length>=24&&rankTerms(clean,6).length>=3;
}

function speakerLabel(turn:ConversationEpisodeTurn):string{
  if(turn.role==='user')return'USER';
  const name=turn.speakerName?.trim();
  return`${name||'COMPANION'}${turn.speakerCharacterInstanceId?` [${turn.speakerCharacterInstanceId}]`:''}`;
}
function rankTerms(value:string,limit:number):string[]{
  const counts=new Map<string,number>();
  for(const term of value.toLowerCase().replace(/[^a-z0-9']+/g,' ').split(' ')){
    const clean=term.replace(/^'+|'+$/g,'');
    if(clean.length<4||stopWords.has(clean)||/^\d+$/.test(clean))continue;
    counts.set(clean,(counts.get(clean)??0)+1);
  }
  return[...counts.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0])).slice(0,limit).map(([term])=>term);
}
function compact(value:string,limit:number):string{const clean=value.replace(/\s+/g,' ').trim();return clean.length<=limit?clean:`${clean.slice(0,limit-1).trimEnd()}…`;}
