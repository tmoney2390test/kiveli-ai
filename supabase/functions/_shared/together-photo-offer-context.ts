type Row=Record<string,any>;

export type PhotoOfferSceneContext={
  locationId:string|null;
  location:string;
  activity:string;
  activityKey?:string;
  mood:string;
  source:string;
  sceneSessionId?:string;
  sharedPlanId?:string;
  scheduleEventId?:string;
};

export type PhotoOfferContext={
  character:{name:string;slug?:string};
  currentScene:PhotoOfferSceneContext;
  resolutionSource:'active_scene'|'character_state';
};

/**
 * Builds the confirmation-card context exclusively from rows already loaded by
 * together-dialogue. Full presence, schedule, memory, and life simulation are
 * intentionally deferred until the user accepts the offer.
 */
export function derivePhotoOfferContext(input:{
  instance:Row;
  conversation:Row;
  now?:Date;
}):PhotoOfferContext{
  const now=input.now??new Date();
  const instance=input.instance??{};
  const template=asRow(instance.together_character_templates);
  const metadata=asRow(input.conversation?.metadata);
  const stored=asRow(metadata.activeScene??metadata.scene);
  const activeScene=isUsableStoredScene(stored,String(instance.id??''),now)?stored:null;
  const activityKey=nonEmpty(activeScene?.activityKey);
  const instanceActivity=nonEmpty(instance.current_activity)??'Having some unstructured time';
  const activity=nonEmpty(activeScene?.activityLabel)??(activityKey?humanize(activityKey):instanceActivity);
  const locationId=nonEmpty(activeScene?.locationId)??nonEmpty(instance.current_location_id)??null;
  const location=nonEmpty(activeScene?.locationName)??nonEmpty(instance.current_location_name)??(activeScene?'Current scene':'Current place');
  const sceneSessionId=nonEmpty(activeScene?.sceneSessionId);
  const sharedPlanId=activeScene?.entryReason==='shared_plan'?nonEmpty(activeScene.sourceEventId):undefined;
  const scheduleEventId=nonEmpty(activeScene?.scheduleEventId);
  const slug=nonEmpty(template.slug);

  return{
    character:{name:nonEmpty(template.name)??'Your companion',...(slug?{slug}:{})},
    currentScene:{
      locationId,
      location,
      activity,
      ...(activityKey?{activityKey}:{}),
      mood:nonEmpty(instance.current_mood)??'present',
      source:nonEmpty(activeScene?.source)??nonEmpty(instance.current_presence_source)??'character_state',
      ...(sceneSessionId?{sceneSessionId}:{}),
      ...(sharedPlanId?{sharedPlanId}:{}),
      ...(scheduleEventId?{scheduleEventId}:{}),
    },
    resolutionSource:activeScene?'active_scene':'character_state',
  };
}

function isUsableStoredScene(scene:Row,characterInstanceId:string,now:Date):boolean{
  if(!scene||scene.interactionMode!=='co_present'||String(scene.characterInstanceId??'')!==characterInstanceId)return false;
  const enteredAt=new Date(String(scene.enteredAt??'')).getTime();
  if(!Number.isFinite(enteredAt)||now.getTime()>=enteredAt+3*60*60*1000)return false;
  if(scene.validUntil){
    const validUntil=new Date(String(scene.validUntil)).getTime();
    if(!Number.isFinite(validUntil)||now.getTime()>=validUntil)return false;
  }
  return true;
}

function asRow(value:unknown):Row{return value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}};
function nonEmpty(value:unknown):string|undefined{const text=typeof value==='string'?value.trim():'';return text||undefined;}
function humanize(value:string):string{const normalized=value.replace(/[_-]+/g,' ').trim();return normalized?normalized.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}
