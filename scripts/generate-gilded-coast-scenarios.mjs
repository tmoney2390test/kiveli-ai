import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gildedPack, validateGildedPack } from '../content/gilded-coast/pack.mjs';

const root=resolve(import.meta.dirname,'..');
const audit=validateGildedPack();
if(!audit.ok)throw new Error(audit.errors.join('; '));
const byCharacter=new Map(gildedPack.characters.map((person)=>[person.slug,person]));
const byLocation=new Map(gildedPack.locations.map((place)=>[place.slug,place]));
const stories=gildedPack.storyArcs.map((arc)=>{
  const lead=byCharacter.get(arc.involved[0]);
  const location=byLocation.get(arc.locationSlug);
  if(!lead||!location||arc.stages.length<3)throw new Error(`Incomplete Gilded Coast scenario ${arc.slug}`);
  return {id:`story-gilded-${arc.slug}`,arcSlug:arc.slug,arcTitle:arc.title,title:arc.title,
    worldId:gildedPack.world.id,worldSlug:gildedPack.world.slug,leadName:lead.name,
    characterSlug:lead.slug,characterTemplateId:lead.templateId,gender:lead.gender==='woman'?'female':lead.gender==='man'?'male':'nonbinary',
    locationId:location.id,locationSlug:location.slug,locationName:location.name,
    themes:['Gilded Coast','Storyline'],setup:arc.premise,requiredState:null,
    opening:'Begin with the concrete public incident, in the lead’s own voice. Invite a question or action; do not deliver a whole investigation unprompted.',
    guidance:'The player can ask questions, decline to investigate, or spend ordinary time with the lead. Romance is optional.',
    minRelationshipStage:'acquaintance',
    chapters:arc.stages.map((stage,index)=>({id:`${arc.slug}-${index+1}`,title:['The incident','A second account','The evidence','A local choice'][index]??`Part ${index+1}`,guidance:stage,knowledge:index>0&&arc.coreFacts[index-1]?[{title:arc.coreFacts[index-1],gate:`Only after the evidence or witness in part ${index+1} is actually examined.`}]:[],locationId:location.id})),
    canon:arc.coreFacts,outcomes:arc.possibleEndStates,
    knowledgeRule:'Only the lead knows what they witnessed or were told. Do not copy private disclosures to other characters automatically.'};
});
const publicRows=stories.map(({id,title,worldSlug,worldId,leadName,characterSlug,characterTemplateId,gender,locationId,locationSlug,locationName,themes,setup,requiredState,arcSlug,arcTitle,chapters,minRelationshipStage})=>({id,title,worldSlug,worldId,leadName,characterSlug,characterTemplateId,gender,locationId,locationSlug,locationName,themes,setup,requiredState,arcSlug,arcTitle,chapterCount:chapters.length,minRelationshipStage}));
const q=(value)=>`'${String(value).replaceAll("'","''")}'`;
const sql=`-- Gilded Coast remains hidden until an explicit release; scenario rows are staged with it.\nbegin;\ninsert into public.together_scenario_definitions(id,character_template_id,world_id,location_id,title) values\n${stories.map((s)=>`(${[s.id,s.characterTemplateId,s.worldId,s.locationId,s.title].map(q).join(',')})`).join(',\n')}\non conflict(id) do update set character_template_id=excluded.character_template_id,world_id=excluded.world_id,location_id=excluded.location_id,title=excluded.title;\nupdate public.together_story_arc_templates set prerequisites=coalesce(prerequisites,'{}'::jsonb)||'{"scenarioDriven":true}'::jsonb where specific_world_id=${q(gildedPack.world.id)}::uuid and slug in (${stories.map((s)=>q(s.arcSlug)).join(',')});\ncommit;\n`;
const jsonPath=resolve(root,'content/gilded-coast/scenario-catalog.json');
const clientPath=resolve(root,'apps/together/src/lib/gildedCoastScenarioCatalog.ts');
const sqlPath=resolve(root,'supabase/migrations/20261002193300_gilded_coast_scenarios.sql');
await mkdir(resolve(root,'apps/together/src/lib'),{recursive:true});
await writeFile(jsonPath,JSON.stringify(stories,null,2)+'\n');
await writeFile(clientPath,`import type { Scenario } from './scenarioCatalog';\n\nexport const gildedCoastScenarios: Scenario[] = ${JSON.stringify(publicRows,null,2)};\n`);
await writeFile(sqlPath,sql);
console.log(JSON.stringify({scenarios:stories.length,jsonPath,clientPath,sqlPath},null,2));
