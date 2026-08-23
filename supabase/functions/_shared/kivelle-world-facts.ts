import { contentLevelEligible,daypartEligible,isCasualGreeting,isDirectAuthoredQuery,normalizeAuthoredText,relationshipStageEligible,storyEligible,termMatches,textTermMatches,turnsCoolingDown,type AuthoredContentUsage } from './kivelle-authored-depth.ts';

export type WorldFactCandidate=Record<string,any>;
export type RelevantWorldFact={
  id:string;slug:string;title:string;factText:string;category:string;
  truthMode:'canonical'|'disputed'|'rumor'|'secret';knowledgeScope:string;contentLevel:string;
  locationId:string|null;districtLocationId:string|null;eventTemplateSlug:string|null;interactive:boolean;score:number;
};

export type WorldFactResolverInput={
  candidates:WorldFactCandidate[];worldId:string;currentLocationId?:string|null;districtLocationId?:string|null;
  userMessage:string;queryIntent?:string;contentMode:string;relationshipStage?:string;worldFamiliarity:number;
  characterWorldFamiliarity?:number;characterPresenceType?:string;characterSlug?:string;characterOccupation?:string;
  characterTags?:string[];activeStorySlug?:string|null;recentUsage?:Map<string,AuthoredContentUsage>;
  currentTurn?:number|null;daypart?:string;maximumResults?:number;
};

export function resolveRelevantWorldFacts(input:WorldFactResolverInput):RelevantWorldFact[]{
  const directQuery=isDirectAuthoredQuery(input.userMessage,input.queryIntent);
  if(isCasualGreeting(input.userMessage)&&!directQuery)return[];
  const terms=searchableTerms(input.userMessage),romanceRelevant=/\b(date|dating|romance|romantic|relationship|intimate|sex|sexual|kiss|lover)\b/i.test(input.userMessage);
  const characterTerms=[...(input.characterTags??[]),input.characterOccupation??'',input.characterSlug??''].map(normalizeAuthoredText).filter(Boolean);
  const results:RelevantWorldFact[]=[];
  for(const row of input.candidates.slice(0,20)){
    if(String(row.world_id)!==input.worldId||row.active===false)continue;
    if(!contentLevelEligible(row.content_level,input.contentMode))continue;
    if(!relationshipStageEligible(input.relationshipStage,Array.isArray(row.relationship_stages)&&row.relationship_stages.length?earliestStage(row.relationship_stages):undefined,Array.isArray(row.relationship_stages)&&row.relationship_stages.length?latestStage(row.relationship_stages):undefined))continue;
    if(!daypartEligible(row.dayparts,input.daypart)||!storyEligible(row.required_story_slug,input.activeStorySlug))continue;
    if(!knowledgeEligible(row,input))continue;
    const locationMatch=Boolean(input.currentLocationId&&String(row.location_id??'')===input.currentLocationId);
    const districtMatch=Boolean(input.districtLocationId&&String(row.district_location_id??'')===input.districtLocationId);
    const triggerMatches=termMatches(row.trigger_terms,terms);
    const topicMatches=termMatches(row.topic_tags,terms)+textTermMatches(`${row.title??''} ${row.category??''}`,terms);
    const storyMatch=Boolean(row.required_story_slug&&storyEligible(row.required_story_slug,input.activeStorySlug));
    const characterMatch=termMatches([...(row.topic_tags??[]),...(metadataStrings(row.metadata,'occupationTags'))],characterTerms);
    const locationInquiry=/\b(here|place|venue|district|neighborhood|city|town|private|record|allowed|rule|history)\b/i.test(input.userMessage);
    const categoryInquiry=directQuery&&categoryRelevant(String(row.category??''),input.userMessage,input.queryIntent);
    const hasEvidence=triggerMatches>0||topicMatches>0||storyMatch||categoryInquiry||(locationMatch&&locationInquiry);
    if(!hasEvidence)continue;
    const usage=input.recentUsage?.get(`world_fact:${String(row.id)}`);
    if(turnsCoolingDown({usage,currentTurn:input.currentTurn,cooldownTurns:Number(row.cooldown_turns??20),directOverride:directQuery&&(triggerMatches>0||categoryInquiry)}))continue;
    let score=Number(row.weight??1)*4;
    if(locationMatch)score+=100;
    if(districtMatch)score+=70;
    score+=Math.min(60,triggerMatches*50)+Math.min(40,topicMatches*20);
    if(categoryInquiry)score+=35;
    if(storyMatch)score+=30;
    if(romanceRelevant&&['adult','romance','dating','relationship','privacy'].includes(String(row.category)))score+=25;
    if(characterMatch>0)score+=20;
    if(input.worldFamiliarity>=Number(row.min_world_familiarity??0))score+=15;
    if(row.knowledge_scope==='public')score+=10;
    if(score<(directQuery?35:55))continue;
    results.push({id:String(row.id),slug:String(row.slug),title:String(row.title),factText:String(row.fact_text),category:String(row.category),truthMode:String(row.truth_mode) as RelevantWorldFact['truthMode'],knowledgeScope:String(row.knowledge_scope),contentLevel:String(row.content_level??'standard'),locationId:row.location_id?String(row.location_id):null,districtLocationId:row.district_location_id?String(row.district_location_id):null,eventTemplateSlug:row.event_template_slug?String(row.event_template_slug):null,interactive:Boolean(row.interactive),score});
  }
  const cap=Math.min(input.maximumResults??(directQuery?5:2),directQuery?5:2);
  return results.sort((left,right)=>right.score-left.score||left.slug.localeCompare(right.slug)).slice(0,cap);
}

function knowledgeEligible(row:WorldFactCandidate,input:WorldFactResolverInput):boolean{
  const minimum=Number(row.min_world_familiarity??0);if(input.worldFamiliarity<minimum)return false;
  const scope=String(row.knowledge_scope??'public'),characterFamiliarity=Number(input.characterWorldFamiliarity??0),resident=['resident','native'].includes(String(input.characterPresenceType??''));
  if(scope==='public')return true;
  if(scope==='visitor')return input.worldFamiliarity>=5||characterFamiliarity>=.25;
  if(scope==='local')return input.worldFamiliarity>=20||characterFamiliarity>=.6||resident;
  if(scope==='insider')return characterFamiliarity>=.75&&(resident||metadataIncludes(row.metadata,'insiderCharacterSlugs',input.characterSlug)||metadataIncludes(row.metadata,'insiderOccupationTags',input.characterOccupation));
  if(scope==='story')return storyEligible(row.required_story_slug,input.activeStorySlug)&&Boolean(input.activeStorySlug);
  if(scope==='private'){
    const characterSlugs=metadataArray(row.metadata,'characterSlugs'),occupationTags=metadataArray(row.metadata,'occupationTags'),relationshipStages=metadataArray(row.metadata,'relationshipStages');
    const hasCondition=characterSlugs.length>0||occupationTags.length>0||relationshipStages.length>0;
    if(!hasCondition)return false;
    if(characterSlugs.length&&!metadataIncludes(row.metadata,'characterSlugs',input.characterSlug))return false;
    if(occupationTags.length&&!metadataIncludes(row.metadata,'occupationTags',input.characterOccupation))return false;
    if(relationshipStages.length&&!relationshipStageEligible(input.relationshipStage,relationshipStages[0]))return false;
    return true;
  }
  return false;
}

function searchableTerms(message:string):string[]{const normalized=normalizeAuthoredText(message),tokens=normalized.split(' ').filter((item)=>item.length>2),terms=new Set(tokens);for(let size=2;size<=3;size+=1)for(let index=0;index+size<=tokens.length;index+=1)terms.add(tokens.slice(index,index+size).join(' '));return[...terms];}
function categoryRelevant(category:string,message:string,intent?:string){const text=normalizeAuthoredText(message);if(intent==='history'&&category==='history')return true;const map:Record<string,RegExp>={history:/\b(history|historic|happened|founded|winter|fire|disappear)/,law:/\b(law|legal|illegal|rule|allowed|crime|record|consent)/,privacy:/\b(private|privacy|record|surveillance|track|anonymous)/,culture:/\b(culture|custom|tradition|etiquette|mean|meaning)/,custom:/\b(custom|tradition|etiquette|mean|meaning)/,romance:/\b(romance|romantic|date|relationship|lover)/,dating:/\b(date|dating|exclusive|relationship)/,adult:/\b(adult|sex|sexual|nude|naked|intimate)/,rumor:/\b(rumor|heard|supposedly)/,folklore:/\b(legend|folklore|ghost|myth)/,scandal:/\b(scandal|affair|trial)/,technology:/\b(technology|digital|data|biometric|synthetic|device)/};return map[category]?.test(text)??false;}
function metadataArray(metadata:unknown,key:string):string[]{const row=metadata&&typeof metadata==='object'?metadata as Record<string,unknown>:{};return Array.isArray(row[key])?(row[key] as unknown[]).map(String):[];}
function metadataStrings(metadata:unknown,key:string):string[]{return metadataArray(metadata,key);}
function metadataIncludes(metadata:unknown,key:string,value:unknown):boolean{const target=normalizeAuthoredText(value);return Boolean(target)&&metadataArray(metadata,key).map(normalizeAuthoredText).includes(target);}
const stages=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];
function earliestStage(values:string[]){return [...values].sort((a,b)=>stages.indexOf(a)-stages.indexOf(b))[0];}
function latestStage(values:string[]){return [...values].sort((a,b)=>stages.indexOf(b)-stages.indexOf(a))[0];}
