import originals from '../../../content/scenarios/runtime-catalog.json' with {type:'json'};
import storylines from '../../../content/scenarios/storyline-catalog.json' with {type:'json'};
export const scenarioCatalog = [...originals.filter(s=>!storylines.some(t=>t.id===s.id)), ...storylines];
export const storylineCatalog = storylines;
export function storylineFor(id:string){return storylines.find(s=>s.id===id);}
export function scenarioSessionView(session:Record<string,any>){
 const story=storylineFor(String(session['scenario_id'])),index=Number(session['story_progress']?.chapterIndex??0);
 return {...session,chapter:story?{index,title:story.chapters[index]?.title??story.chapters[0]!.title,count:story.chapters.length,arcTitle:story.arcTitle}:null};
}
export function publicArcView(arc:Record<string,any>){
 if(!storylineCatalog.some(s=>s.arcSlug===arc['template_slug']))return arc;
 const t=arc['together_story_arc_templates'];
 return {...arc,together_story_arc_templates:t?{slug:t.slug,title:t.title,priority:t.priority,chapters:(t.chapters??[]).map((c:Record<string,any>)=>({id:c['id'],title:c['title'],narrativeSeed:''})),prerequisites:{scenarioDriven:true}}:null};
}
export function isConvertedArcEvent(event:Record<string,any>):boolean{return event['event_type']==='story_arc'&&storylineCatalog.some(s=>s.arcSlug===event['metadata']?.arc_slug);}
