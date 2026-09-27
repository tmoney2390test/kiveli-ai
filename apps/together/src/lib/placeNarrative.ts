import type{LocationLore}from'../types';

type PlaceNarrativeInput={
  description:string;
  lore:LocationLore;
  backstory?:unknown;
};

export function buildPlaceNarrative({description,lore,backstory}:PlaceNarrativeInput){
  const overview=sentences([lore.summary??description,text(backstory)]);
  // The remaining lore fields inform stories and character behavior. They can
  // contain editorial directions, operational constraints, and generated
  // scaffolding that should never appear as public place descriptions.
  return overview?[overview]:[];
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

function text(value:unknown){return typeof value==='string'&&value.trim()?value.trim():undefined;}
function unique(values:Array<string|undefined>){return[...new Set(values.filter((value):value is string=>Boolean(value)))];}
