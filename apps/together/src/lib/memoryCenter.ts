import type { MemoryCenterCategory, MemoryCenterItem } from '../types';
import { presentMemoryText } from './memoryPresentation';

export const MEMORY_CATEGORY_OPTIONS:Array<{key:MemoryCenterCategory;label:string;types:MemoryCenterItem['memory_type'][]}>=[
  {key:'all',label:'All',types:['semantic','emotional','preference','episodic','relationship','open_thread']},
  {key:'about',label:'About you',types:['semantic','emotional']},
  {key:'preference',label:'Preferences',types:['preference']},
  {key:'shared',label:'Shared moments',types:['episodic']},
  {key:'relationship',label:'Relationship',types:['relationship']},
  {key:'upcoming',label:'Upcoming',types:['open_thread']},
];

export function memoryCategoryCount(category:MemoryCenterCategory,counts:Record<string,number>,total:number){
  if(category==='all')return total;
  const option=MEMORY_CATEGORY_OPTIONS.find((item)=>item.key===category);
  return(option?.types??[]).reduce((sum,type)=>sum+Number(counts[type]??0),0);
}

export function mergeMemoryPages(current:MemoryCenterItem[],incoming:MemoryCenterItem[]){
  const byId=new Map(current.map((memory)=>[memory.id,memory]));
  incoming.forEach((memory)=>byId.set(memory.id,memory));
  return[...byId.values()];
}

export function presentInsightText(value:string,companionName:string){
  return presentMemoryText(value,companionName);
}

export function optimisticMemoryMutation(memories:MemoryCenterItem[],ids:readonly string[],operation:'pin'|'unpin'|'forget'){
  const selected=new Set(ids);
  if(operation==='forget')return memories.filter((memory)=>!selected.has(memory.id));
  return memories.map((memory)=>selected.has(memory.id)?{...memory,pinned:operation==='pin'}:memory);
}
