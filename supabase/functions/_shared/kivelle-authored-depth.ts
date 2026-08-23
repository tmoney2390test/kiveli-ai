export type AuthoredContentMode='standard'|'romance'|'mature'|'explicit';
export type AuthoredContentUsage={contentKind:string;contentKey:string;usedAt:string;conversationTurn?:number|null};

const contentRank:Record<AuthoredContentMode,number>={standard:0,romance:1,mature:2,explicit:3};
const relationshipRank:Record<string,number>={stranger:0,acquaintance:1,friend:2,flirting:3,dating:4,exclusive:5,long_term:6};
const stopWords=new Set(['about','after','again','also','been','being','could','does','from','have','here','into','just','know','like','more','really','should','some','than','that','their','them','then','there','these','they','this','through','want','were','what','when','where','which','while','with','would','your','youre']);

export function normalizeAuthoredText(value:unknown):string{
  return String(value??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

export function authoredSearchTerms(message:string):string[]{
  const tokens=normalizeAuthoredText(message).split(' ').filter((token)=>token.length>2&&!stopWords.has(token)).slice(0,18);
  const terms=new Set(tokens);
  for(let size=2;size<=3;size+=1)for(let index=0;index+size<=tokens.length;index+=1)terms.add(tokens.slice(index,index+size).join(' '));
  return[...terms].slice(0,48);
}

export function termMatches(values:unknown,terms:readonly string[]):number{
  const normalized=(Array.isArray(values)?values:[]).map(normalizeAuthoredText).filter(Boolean);
  let matches=0;
  for(const candidate of normalized)if(terms.some((term)=>term===candidate||term.includes(candidate)||candidate.includes(term)))matches+=1;
  return matches;
}

export function textTermMatches(text:unknown,terms:readonly string[]):number{
  const normalized=normalizeAuthoredText(text);
  return terms.filter((term)=>term.length>2&&normalized.includes(term)).length;
}

export function contentLevelEligible(level:unknown,mode:unknown):boolean{
  const content=String(level??'standard') as AuthoredContentMode,resolved=String(mode??'standard') as AuthoredContentMode;
  return content in contentRank&&resolved in contentRank&&contentRank[content]<=contentRank[resolved];
}

export function relationshipStageEligible(stage:unknown,min?:unknown,max?:unknown):boolean{
  const current=relationshipRank[String(stage??'stranger')]??0;
  if(min!=null&&current<(relationshipRank[String(min)]??Number.POSITIVE_INFINITY))return false;
  if(max!=null&&current>(relationshipRank[String(max)]??Number.NEGATIVE_INFINITY))return false;
  return true;
}

export function storyEligible(requiredSlug:unknown,activeStorySlug:unknown):boolean{
  if(!requiredSlug)return true;
  return normalizeAuthoredText(requiredSlug)===normalizeAuthoredText(activeStorySlug);
}

export function daypartEligible(dayparts:unknown,currentDaypart:unknown):boolean{
  const rows=Array.isArray(dayparts)?dayparts.map(normalizeAuthoredText).filter(Boolean):[];
  return rows.length===0||rows.includes(normalizeAuthoredText(currentDaypart));
}

export function modeEligible(modes:unknown,currentModes:readonly string[]):boolean{
  const rows=Array.isArray(modes)?modes.map(normalizeAuthoredText).filter(Boolean):[];
  return rows.length===0||rows.some((mode)=>currentModes.map(normalizeAuthoredText).includes(mode));
}

export function isCasualGreeting(message:string):boolean{
  const normalized=normalizeAuthoredText(message);
  return /^(?:hi|hey|hello|hiya|yo|sup|good morning|good afternoon|good evening|how are you|hows it going)[.! ]*$/.test(normalized);
}

export function isDirectAuthoredQuery(message:string,queryIntent?:string):boolean{
  if(['history','location','story'].includes(String(queryIntent??'')))return true;
  return /\b(what|why|when|where|who|how|is|are|can|could|tell me|explain)\b/i.test(message)&&/\b(history|historic|law|legal|illegal|rule|custom|culture|tradition|rumor|legend|folklore|scandal|record|recording|private|privacy|allowed|happened|mean|means|known for)\b/i.test(message);
}

export function worldFactCategories(message:string,queryIntent?:string):string[]{
  const rows=new Set<string>();const text=normalizeAuthoredText(message);
  if(queryIntent==='history'||/\b(history|historic|happened|founded|war|fire|winter|origin|disappear)/.test(text))rows.add('history');
  if(/\b(law|legal|illegal|rule|allowed|crime|police|record|recording|consent)/.test(text)){rows.add('law');rows.add('privacy');}
  if(/\b(private|privacy|discreet|secret|anonymous|surveillance|track)/.test(text))rows.add('privacy');
  if(/\b(date|dating|romance|romantic|relationship|exclusive|lover|marry|marriage)/.test(text)){rows.add('dating');rows.add('romance');rows.add('relationship');}
  if(/\b(sex|sexual|adult|nude|naked|intimate)/.test(text))rows.add('adult');
  if(/\b(custom|culture|tradition|etiquette|social|mean|meaning)/.test(text)){rows.add('culture');rows.add('custom');rows.add('social');}
  if(/\b(rumor|legend|folklore|ghost|myth)/.test(text)){rows.add('rumor');rows.add('folklore');}
  if(/\b(scandal|affair|betray|trial)/.test(text))rows.add('scandal');
  if(/\b(technology|digital|biometric|synthetic|data|device|rating)/.test(text))rows.add('technology');
  if(/\b(government|council|mayor|civic|politic)/.test(text))rows.add('politics');
  return[...rows];
}

export function turnsCoolingDown(input:{usage?:AuthoredContentUsage;currentTurn?:number|null;cooldownTurns:number;directOverride?:boolean}):boolean{
  if(input.directOverride||!input.usage||input.cooldownTurns<=0)return false;
  const usedTurn=Number(input.usage.conversationTurn),current=Number(input.currentTurn);
  if(Number.isFinite(usedTurn)&&Number.isFinite(current))return current-usedTurn<input.cooldownTurns;
  return Date.now()-new Date(input.usage.usedAt).getTime()<Math.max(1,input.cooldownTurns)*90_000;
}

export function hoursCoolingDown(input:{usage?:AuthoredContentUsage;cooldownHours:number;now?:Date}):boolean{
  if(!input.usage||input.cooldownHours<=0)return false;
  return(input.now??new Date()).getTime()-new Date(input.usage.usedAt).getTime()<input.cooldownHours*3_600_000;
}

export function latestUsageByKey(rows:readonly AuthoredContentUsage[]):Map<string,AuthoredContentUsage>{
  const map=new Map<string,AuthoredContentUsage>();
  for(const row of rows){const key=`${row.contentKind}:${row.contentKey}`;const prior=map.get(key);if(!prior||new Date(row.usedAt)>new Date(prior.usedAt))map.set(key,row);}
  return map;
}

export function authoredRecordId(value:Record<string,unknown>):string{return String(value.id??value.slug??'');}
