import type{LocationLore}from'../types';

type PlaceNarrativeInput={
  description:string;
  lore:LocationLore;
  backstory?:unknown;
  socialTexture?:unknown;
  crowdNow?:string;
};

export function buildPlaceNarrative({description,lore,backstory,socialTexture,crowdNow}:PlaceNarrativeInput){
  const overview=sentences([lore.summary??description,text(backstory)]);
  const atmosphere=sentences([
    text(socialTexture),
    crowdNow,
    lore.sensoryDetails?.length?`You’ll notice ${naturalList(lore.sensoryDetails.slice(0,2))}.`:undefined,
  ]);
  const history=sentences(lore.publicHistory??[]);
  const people=(lore.recurringPeople??[]).slice(0,4);
  const localCharacter=people.length?sentences([
    `Familiar faces include ${naturalList(people.map((person)=>`${person.label} — ${person.role}`))}.`,
    ...people.map((person)=>person.rhythm),
  ]):'';
  return unique([overview,atmosphere,history,localCharacter]).filter(Boolean);
}

function sentences(values:Array<unknown>){
  return unique(values.map(text).filter((value):value is string=>Boolean(value))).map(sentence).join(' ');
}

function sentence(value:string){
  const trimmed=value.trim();
  if(!trimmed)return'';
  const capitalized=`${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return/[.!?…]$/.test(capitalized)?capitalized:`${capitalized}.`;
}

function naturalList(values:string[]){
  const items=values.map((value)=>value.trim().replace(/[.!?…]+$/,'' )).filter(Boolean);
  if(items.length<2)return items[0]??'';
  if(items.length===2)return`${items[0]} and ${items[1]}`;
  return`${items.slice(0,-1).join(', ')}, and ${items.at(-1)}`;
}

function text(value:unknown){return typeof value==='string'&&value.trim()?value.trim():undefined;}
function unique(values:Array<string|undefined>){return[...new Set(values.filter((value):value is string=>Boolean(value)))];}
