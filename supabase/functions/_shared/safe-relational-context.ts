import type{ConversationAnalysisProvider,ModerationProvider}from'./together-ai.ts';
import type{AiUsageScope}from'./kivelle-ai-usage.ts';

const DIRECT_FALLBACK='You and your companion shared a more intimate moment and grew closer.';
const GROUP_FALLBACK='You and your companions shared a more intimate moment and grew closer.';

/**
 * Derives native-safe relational continuity without copying, rewriting, or
 * keyword-filtering restricted dialogue. Only bounded relationship deltas are
 * converted to controlled prose, and that prose is independently moderated.
 */
export async function deriveSafeRelationalSummary(input:{
  analysis:ConversationAnalysisProvider;
  moderation:ModerationProvider;
  userText:string;
  assistantText:string;
  group?:boolean;
  usageScope?:AiUsageScope;
}):Promise<string>{
  const fallback=input.group?GROUP_FALLBACK:DIRECT_FALLBACK;
  try{
    const proposal=await input.analysis.analyze({userMessage:input.userText,assistantMessage:input.assistantText,existingThreads:[],usageScope:{...input.usageScope,contentMode:'explicit',metadata:{...(input.usageScope?.metadata??{}),pipeline:'safe_relational_summary'}}});
    const candidate=summaryFromDeltas(proposal.relationshipChanges,input.group===true);
    if(!candidate)return fallback;
    const verdict=await input.moderation.check(candidate,{...input.usageScope,contentMode:'standard',metadata:{...(input.usageScope?.metadata??{}),direction:'derived_output',pipeline:'safe_relational_summary'}});
    if(!verdict.allowed||verdict.flagged||verdict.categories.includes('moderation/unavailable')||verdict.categories.some((category)=>/(?:sexual|adult|explicit)/i.test(category)))return fallback;
    return candidate;
  }catch{return fallback;}
}

function summaryFromDeltas(changes:Record<string,number>,group:boolean):string|null{
  const value=(key:string)=>Number(changes[key]??0),subject=group?'The private exchange left the group':'The private exchange left you both';
  if(value('conflict')>1||value('trust')<0||value('comfort')<0)return`${subject} with some tension that may need a gentler conversation later.`;
  if(value('trust')>0||value('comfort')>0||value('affinity')>0||value('familiarity')>0)return`${subject} feeling closer, more trusting, and more at ease with one another.`;
  if(value('respect')>0||value('commitment')>0)return`${subject} with a stronger sense of trust and mutual regard.`;
  return null;
}
