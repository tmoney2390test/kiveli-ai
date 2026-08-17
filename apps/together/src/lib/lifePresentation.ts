import type { CharacterInstance, CharacterScheduleEvent } from '../types';

export function getInterruptibilityPresentation(value:CharacterInstance['current_interruptibility']|CharacterScheduleEvent['interruptibility']){
  if(value==='unavailable')return{label:'Unavailable right now',tone:'quiet' as const};
  if(value==='busy')return{label:'A little tied up right now',tone:'busy' as const};
  if(value==='limited')return{label:'A little busy',tone:'limited' as const};
  return{label:'Free',tone:'open' as const};
}
export function getScheduleEventPresentation(event:CharacterScheduleEvent){return{activity:humanizeActivity(event.activity_key,event.title),availability:getInterruptibilityPresentation(event.interruptibility).label};}
export function getTravelPresentation(){return{activity:'On the move',availability:'May reply between stops'};}
export function getScheduleHint(event:CharacterScheduleEvent){if(event.visibility==='shared')return event.title;if(event.visibility==='known')return humanizeActivity(event.activity_key,event.title);if(event.visibility==='hint')return hint(event.activity_key);return null;}
export function currentScheduleEvent(events:CharacterScheduleEvent[]|undefined,characterId:string,now=new Date(),currentEventId?:string|null){if(currentEventId===null)return undefined;const active=(events??[]).filter(event=>event.character_instance_id===characterId&&new Date(event.starts_at)<=now&&new Date(event.ends_at)>now);if(currentEventId)return active.find(event=>event.id===currentEventId);return active.sort((a,b)=>priority(b.priority)-priority(a.priority))[0];}
export function nextVisibleScheduleEvents(events:CharacterScheduleEvent[]|undefined,characterId:string,now=new Date()){return(events??[]).filter(event=>event.character_instance_id===characterId&&event.visibility!=='hidden'&&new Date(event.starts_at)>now).sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime());}
function humanizeActivity(key:string,title:string){if(key==='travel')return'On the move';if(key==='sleep')return'Sleeping';if(key==='work')return title||'Working';if(key.includes('photo'))return'Taking photos';if(key.includes('coffee'))return'Having coffee';if(key.includes('home'))return'Winding down at home';if(key.includes('gym'))return'Getting a workout in';return title||key.replace(/[_-]+/g,' ').replace(/^[a-z]/,letter=>letter.toUpperCase());}
function hint(key:string){if(key.includes('social')||key.includes('drink'))return'Might go out later';if(key.includes('photo')||key.includes('walk'))return'Might get outside later';if(key.includes('work'))return'Working for a while';return'Has something in mind later';}
function priority(value:CharacterScheduleEvent['priority']){return({user_commitment:7,hard_obligation:6,recurring_routine:5,relationship_event:4,social_event:3,preferred_activity:2,spontaneous_activity:1} as const)[value];}

