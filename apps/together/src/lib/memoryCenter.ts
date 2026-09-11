import type { MemoryCenterAuthorKind, MemoryCenterCategory, MemoryCenterItem } from '../types';
import { presentMemoryText } from './memoryPresentation';

export const MEMORY_CATEGORY_OPTIONS:Array<{key:MemoryCenterCategory;label:string}>=[
  {key:'all',label:'All'},
  {key:'core_rules',label:'Core rules'},
  {key:'about',label:'About you'},
  {key:'additional',label:'Additional details'},
  {key:'upcoming',label:'Upcoming'},
];

export const MEMORY_AUTHOR_KINDS:Array<{key:MemoryCenterAuthorKind;label:string;hint:string}>=[
  {key:'core_rule',label:'Core rules',hint:'Always in effect. They will live this immediately, not treat it as optional flavor.'},
  {key:'about',label:'About you',hint:'Facts about you — who you are, what you do, and the details that stay true.'},
  {key:'additional',label:'Additional details',hint:'Preferences, emotional context, and how this relationship works.'},
];

export function memoryCategoryCount(category:MemoryCenterCategory,counts:Record<string,number>,total:number){
  if(category==='all')return total;
  if(category==='core_rules')return Number(counts.core_rule??0);
  if(category==='about')return Number(counts.about??counts.semantic??0);
  if(category==='additional')return Number(counts.additional??0);
  if(category==='upcoming')return Number(counts.open_thread??0);
  return 0;
}

export function memoryJournalLabel(memory:Pick<MemoryCenterItem,'memory_type'|'kind'|'coreRule'|'personaName'>){
  if(memory.coreRule||memory.kind==='core_rule')return 'Core rules';
  if(memory.memory_type==='open_thread'||memory.kind==='upcoming')return 'Upcoming';
  if(memory.kind==='about'||memory.memory_type==='semantic')return memory.personaName?`About you · ${memory.personaName}`:'About you';
  return 'Additional details';
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
