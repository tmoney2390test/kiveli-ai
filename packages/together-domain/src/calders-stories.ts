export type CalderTransition={arcSlug:string;ending:string;characterIds:string[];summary:string;recordedAt:string;kind:'agreement'|'absence'|'relocation';returnAt?:string;locationId?:string;departingCharacterId?:string};
export type CalderArc={slug:string;title:string;openingHook:string;characterIds:string[];locationIds:string[];stages:Array<{index:number;title:string;scene:string}>;clues:Array<{id:string;title:string;holderCharacterId:string;originLocationId:string;revealGate:string;portable?:boolean}>;endings:Array<{key:string;title:string;consequences:string;transition?:{kind:'absence'|'relocation';characterId:string}}>;declineOption:string};
export type CalderProgress={flags:string[];arcs:Record<string,{stage:number;status:'active'|'paused'|'completed';ending?:string;summary?:string}>;evidence:string[];disclosures:Record<string,string[]>;reservations:Array<Record<string,unknown>>;transitions:CalderTransition[]};
export type CalderStoryAction={type:'start'|'advance'|'pause'|'resume'|'resolve'|'investigate';arcSlug:string;choiceId?:string;returnAt?:string;locationId?:string};
export function normalizeCalderProgress(state:Partial<CalderProgress>):CalderProgress {
  return {flags:state.flags??[],arcs:state.arcs??{},evidence:state.evidence??[],disclosures:state.disclosures??{},reservations:state.reservations??[],transitions:state.transitions??[]};
}
export function applyCalderStoryAction(input:{arcs:CalderArc[];state:Partial<CalderProgress>;action:CalderStoryAction;eligibleEvidenceIds?:string[];now?:Date;allowedRelocationIds?:string[]}):CalderProgress {
  const state=structuredClone(normalizeCalderProgress(input.state)),a=input.action,arc=input.arcs.find(arc=>arc.slug===a.arcSlug);
  if(!arc)throw new Error('That story is unavailable.');
  const current=state.arcs[a.arcSlug];
  if(a.type==='start'){if(current)throw new Error('This story has already begun.');state.arcs[a.arcSlug]={stage:1,status:'active'};return state;}
  if(!current)throw new Error('Start the story first.');
  if(current.status==='completed')throw new Error('This ending is already part of your story.');
  if(a.type==='pause'){current.status='paused';return state;}
  if(a.type==='resume'){current.status='active';return state;}
  if(current.status!=='active')throw new Error('Resume the story to continue.');
  if(a.type==='investigate'){
    const clue=arc.clues.find(c=>c.id===a.choiceId);
    if(!clue||!input.eligibleEvidenceIds?.includes(clue.id))throw new Error('This evidence has not been offered by its holder.');
    if(!state.evidence.includes(clue.id))state.evidence.push(clue.id);
    return state;
  }
  if(a.type==='advance'){
    if(current.stage>=arc.stages.length)throw new Error('Choose how this story resolves.');
    if(current.stage>=2&&arc.clues.length&&!arc.clues.some(clue=>state.evidence.includes(clue.id)))throw new Error('Follow up on evidence with its holder before reaching a decision.');
    current.stage++;
    // An authored neutral meeting precedes the invitation. A place name alone never opens the route.
    if(arc.slug==='the-crowcut-reckoning'&&current.stage===2)state.flags.push('crowcut.access_granted');
    state.flags=[...new Set(state.flags)];return state;
  }
  if(a.type==='resolve'){
    if(current.stage!==arc.stages.length)throw new Error('The story has not reached its decision yet.');
    const ending=arc.endings.find(e=>e.key===a.choiceId);
    if(!ending)throw new Error('Choose an available ending.');
    const now=input.now??new Date(),transition=ending.transition;
    if(transition?.kind==='absence'&&(!a.returnAt||!Number.isFinite(Date.parse(a.returnAt))||Date.parse(a.returnAt)<=now.getTime()))throw new Error('Choose the planned return date before this departure.');
    if(transition?.kind==='relocation'&&(!a.locationId||!input.allowedRelocationIds?.includes(a.locationId)))throw new Error('Choose an accessible new base before this move.');
    current.status='completed';current.ending=ending.key;current.summary=ending.consequences;
    state.transitions.push({arcSlug:arc.slug,ending:ending.key,characterIds:arc.characterIds,summary:ending.consequences,recordedAt:now.toISOString(),kind:transition?.kind??'agreement',...(transition?{departingCharacterId:transition.characterId}:{}),...(transition?.kind==='absence'?{returnAt:a.returnAt!}:{}),...(transition?.kind==='relocation'?{locationId:a.locationId!}:{})});
    state.flags.push(`${arc.slug}.resolved:${ending.key}`);
    return state;
  }
  throw new Error('Unsupported story choice.');
}

export function calderStoryContext(arcs:CalderArc[],input:Partial<CalderProgress>,characterId:string){
  const state=normalizeCalderProgress(input);
  return arcs.filter(arc=>arc.characterIds.includes(characterId)&&state.arcs[arc.slug]?.status==='active').map(arc=>{
    const stage=arc.stages.find(s=>s.index===state.arcs[arc.slug]!.stage);
    return {title:arc.title,chapter:stage?.title,agenda:stage?.scene,evidence:arc.clues.filter(clue=>clue.holderCharacterId===characterId&&state.evidence.includes(clue.id)).map(clue=>({title:clue.title,disclosureLimits:clue.revealGate}))};
  });
}

export function calderStoryView(arcs:CalderArc[],input:Partial<CalderProgress>,eligibleEvidenceIds:string[]=[]) {
  const state=normalizeCalderProgress(input);
  return arcs.map(arc=>{
    const progress=state.arcs[arc.slug],stage=arc.stages.find(s=>s.index===progress?.stage);
    return {slug:arc.slug,title:arc.title,opening:arc.openingHook,status:progress?.status??'unstarted',stage:progress?.stage??0,stageCount:arc.stages.length,scene:progress?.status==='active'?stage?.scene:null,chapterTitle:stage?.title??null,summary:progress?.summary??null,declineOption:arc.declineOption,
      choices:progress?.status==='active'&&progress.stage===arc.stages.length?arc.endings.map(e=>({id:e.key,label:e.title,needsReturnDate:e.transition?.kind==='absence',needsNewBase:e.transition?.kind==='relocation'})):[],
      evidence:arc.clues.filter(c=>state.evidence.includes(c.id)||eligibleEvidenceIds.includes(c.id)).map(c=>({id:c.id,title:c.title,discovered:state.evidence.includes(c.id),detail:state.evidence.includes(c.id)?c.revealGate:null}))};
  });
}
