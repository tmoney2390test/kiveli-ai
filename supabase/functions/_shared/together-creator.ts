import {z} from 'zod';

export const characterDraftSchema=z.object({
  displayName:z.string().trim().min(1).max(50),age:z.number().int().min(18).max(99),pronouns:z.string().trim().max(40).optional(),occupation:z.string().trim().min(1).max(100),biography:z.string().trim().min(20).max(1000),
  interests:z.array(z.string().trim().min(1).max(40)).min(1).max(12),traits:z.array(z.string().trim().min(1).max(40)).min(2).max(8),
  personality:z.object({warmth:z.number().min(0).max(1),humor:z.number().min(0).max(1),directness:z.number().min(0).max(1),independence:z.number().min(0).max(1),spontaneity:z.number().min(0).max(1),socialEnergy:z.number().min(0).max(1)}),
  communicationStyle:z.record(z.string(),z.unknown()).default({}),relationshipStyle:z.record(z.string(),z.unknown()).default({}),appearanceDescription:z.string().trim().min(20).max(1000),
  lifestyleHints:z.object({preferredActivities:z.array(z.string()).max(10).optional(),scheduleStyle:z.string().max(200).optional()}).default({}),
});
export type CharacterDraftProposal=z.infer<typeof characterDraftSchema>;
export interface CharacterCreationProvider{propose(concept:string):Promise<CharacterDraftProposal>}

export class ConfiguredCharacterCreationProvider implements CharacterCreationProvider{
  async propose(concept:string):Promise<CharacterDraftProposal>{
    const key=Deno.env.get('OPENAI_API_KEY');if(!key)return deterministicCharacterDraft(concept);
    try{
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('KIVELLE_CREATOR_MODEL')??'gpt-5-mini',input:`Create an original fictional adult Kivelle companion from this concept. Never imitate or name a real person. Return only valid JSON with displayName, age, pronouns, occupation, biography, interests, traits, personality (warmth, humor, directness, independence, spontaneity, socialEnergy from 0 to 1), communicationStyle, relationshipStyle, appearanceDescription, lifestyleHints. Concept:\n${concept}`,max_output_tokens:1000,text:{format:{type:'json_object'}}})});
      if(!response.ok)return deterministicCharacterDraft(concept);
      const payload=await response.json();const raw=payload.output_text??payload.output?.flatMap((item:Record<string,unknown>)=>Array.isArray(item.content)?item.content:[]).find((item:Record<string,unknown>)=>item.type==='output_text')?.text;
      return characterDraftSchema.parse(JSON.parse(String(raw??'{}')));
    }catch{return deterministicCharacterDraft(concept);}
  }
}

export function deterministicCharacterDraft(concept:string):CharacterDraftProposal{
  const age=clamp(Number(concept.match(/\b(\d{2})[- ]year[- ]old\b/i)?.[1]??concept.match(/\bage\s*(\d{2})\b/i)?.[1]??27),18,99);
  const named=concept.match(/(?:named|called)\s+([A-Z][a-z]{1,30})/)?.[1];const occupation=occupationFrom(concept);const interests=interestList(concept);
  const name=named??nameFor(occupation,concept);const lower=concept.toLowerCase();
  const pronouns=/\b(nonbinary|non-binary|they\/?them)\b/.test(lower)?'they/them':/\b(man|male|guy|he\/?him)\b/.test(lower)?'he/him':'she/her';const adultDescription=pronouns==='he/him'?'man':pronouns==='they/them'?'person':'woman';
  const personality={
    warmth:lower.includes('reserved') ? .38 : lower.includes('warm') ? .82 : .62,
    humor:lower.includes('dry humor') ? .82 : lower.includes('playful') ? .78 : .56,
    directness:(lower.includes('confident')||lower.includes('direct')) ? .78 : .58,
    independence:(lower.includes('independent')||lower.includes('ambitious')) ? .82 : .62,
    spontaneity:(lower.includes('spontaneous')||lower.includes('adventurous')) ? .78 : .48,
    socialEnergy:lower.includes('outgoing') ? .82 : lower.includes('private') ? .35 : .56,
  };
  const traits=[lower.includes('confident')?'confident':'perceptive',lower.includes('ambitious')?'ambitious':'curious',lower.includes('dry humor')?'dry humor':lower.includes('playful')?'playful':'thoughtful',personality.independence>.7?'independent':'grounded'];
  const subject=pronouns==='he/him'?'He':pronouns==='they/them'?'They':'She';
  const interestPhrase=naturalList(interests.slice(0,3).map((item)=>item.toLowerCase()));
  const traitPhrase=naturalList([...new Set(traits)].slice(0,3));
  return characterDraftSchema.parse({displayName:name,age,pronouns,occupation,biography:`${name} works as ${article(occupation)} ${occupation.toLowerCase()} and makes time for ${interestPhrase}. ${subject} is ${traitPhrase}; trust and independence matter more to ${name} than instant chemistry.`,interests,traits:[...new Set(traits)],personality,communicationStyle:{messageLength:'short_to_medium',humor:personality.humor>.7?'dry':'natural',asksGenericQuestions:false},relationshipStyle:{pace:lower.includes('slow')?'slow_burn':'natural',independent:personality.independence,affection:personality.warmth},appearanceDescription:`An original fictional adult ${age}-year-old ${adultDescription} with expressive features, a distinctive contemporary style suited to ${occupation.toLowerCase()}, and a grounded photorealistic identity that does not resemble any real person.`,lifestyleHints:{preferredActivities:interests,scheduleStyle:lower.includes('night')?'late creative schedule':'weekday professional schedule with flexible evenings'}});
}

export function appearanceCandidates(proposal:CharacterDraftProposal){const styles=['polished and architectural','warm contemporary','creative understated','confident evening'];return styles.map((style,index)=>({id:crypto.randomUUID(),label:`Look ${index+1}`,description:`${proposal.appearanceDescription} Styling is ${style}. Maintain the same fictional adult identity across future images.`,status:'proposed',visualDoNotChange:['facial structure','eye color','skin tone','identifying features']}));}

function occupationFrom(text:string){const jobs=['architect','photographer','designer','musician','chef','writer','developer','doctor','lawyer','teacher','artist'];const found=jobs.find((job)=>text.toLowerCase().includes(job));return title(found??'creative professional');}
function interestList(text:string){const known=['jazz','music','travel','food','design','photography','movies','sports','gaming','books','technology','outdoors','art','architecture'];const found=known.filter((item)=>text.toLowerCase().includes(item));return found.length?found.map(title):['Music','Food','Travel','Design'];}
function nameFor(occupation:string,text:string){const names=occupation==='Architect'?['Sofia','Nora','Leah']:['Nora','Sofia','Ari'];let sum=0;for(const char of text)sum+=char.charCodeAt(0);return names[sum%names.length]!;}
function title(value:string){return value.replace(/\b\w/g,(letter)=>letter.toUpperCase())}function naturalList(values:string[]){if(values.length<2)return values[0]??'their own interests';return values.length===2?`${values[0]} and ${values[1]}`:`${values.slice(0,-1).join(', ')}, and ${values.at(-1)}`;}function article(value:string){return /^[aeiou]/i.test(value)?'an':'a'}function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
