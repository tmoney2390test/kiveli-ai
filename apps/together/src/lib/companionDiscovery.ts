import type { CharacterTemplate, CharacterVersion } from '../types';

export type CompanionChoice={id:string;name:string;slug:string;occupation:string;summary:string;traits:string[];interests:string[];goals:string[]};

export function discoveryChoice(template:CharacterTemplate&{together_character_versions:CharacterVersion}):CompanionChoice{
  const metadata=template.discovery_metadata??{};
  return{id:template.id,name:template.name,slug:template.slug,occupation:template.occupation,summary:String(metadata.summary??template.biography),traits:Array.isArray(metadata.traits)?metadata.traits.map(String):Object.keys(template.together_character_versions.personality_config).slice(0,3),interests:template.together_character_versions.interests,goals:Array.isArray(metadata.goals)?metadata.goals.map(String):['Friendship','Stories']};
}

export function rankCompanions(goals:string[],interests:string[],choices:CompanionChoice[]){return[...choices].sort((a,b)=>score(b)-score(a));function score(choice:CompanionChoice){return choice.goals.filter((item)=>goals.includes(item)).length*3+choice.interests.filter((item)=>interests.includes(item)).length;}}
