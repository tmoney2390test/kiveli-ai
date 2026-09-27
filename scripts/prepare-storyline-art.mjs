import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd();
const rows=JSON.parse(fs.readFileSync('content/scenarios/storyline-catalog.json','utf8')).filter(s=>s.id.startsWith('story-'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const refs=(kind,world,slug)=>['.jpg','.png','.webp'].map(ext=>`apps/together/assets/${kind}/${world}/${slug}${ext}`).find(p=>fs.existsSync(p));
const jobs=rows.map((s,index)=>{
 const character=refs('characters',s.worldSlug,s.characterSlug),place=refs('locations',s.worldSlug,s.locationSlug);
 if(!character)throw Error(`Missing identity ${s.id}`);
 const references=[character,...(place?[place]:[])].map((p,i)=>({path:p,role:i===0?'character identity':'location architecture',sha256:hash(p)}));
 const prompt=`Use case: photorealistic-natural. Asset: landscape scenario cover for Kivelli, 1536x1024. Create one coherent cinematic still, no panels, no captions, no logo or watermark. Scenario: ${s.title}. World: ${s.worldSlug}. Opening moment: ${s.setup}\nReference image 1 is ${s.leadName}, an adult fictional character: faithfully preserve face, hair, skin tone, age and distinctive appearance. ${place?`Reference image 2 is ${s.locationName}: preserve recognizable architecture, materials and world setting, but compose a fresh scene.`:`The scene is at ${s.locationName}; focus on the character and story-relevant prop, with a discreet plausible background consistent with their world.`}\nDepict the opening question before any resolution. Show one clear action from this setup, not every detail at once. Candid expression, believable anatomy and hands. Medium-wide landscape composition, readable at thumbnail size, subject within the central 80% for card cropping. Crisp natural textures, enough light to see the scene, restrained cinematic contrast, no excessive blur. Fully clothed, non-explicit public catalogue art. Documents and screens have indistinct markings, no legible invented claims. No future plot revelations, no invented supernatural effects, no unrelated train bridges. Respect the era and architecture in the references. Supporting people only if the opening needs them, kept incidental; the lead remains recognizable.`;
 const supporting={56:['adelaide-whitcomb','Adelaide Whitcomb, Hazel’s mother'],61:['sabine-roche','Sabine Roche']}[index];
 let finalPrompt=prompt;
 if(supporting){const p=refs('characters','calders-run',supporting[0]);references.push({path:p,role:`supporting character: ${supporting[1]}`,sha256:hash(p)});finalPrompt+=` Reference image 3 is ${supporting[1]}; if visible, preserve this identity rather than inventing their appearance. Keep both named characters distinct.`;}
 if(index===0)finalPrompt="Generate a new cinematic photorealistic landscape scenario cover, 1536x1024, no text or graphic overlays. Image 1 is June Callahan's identity reference: preserve her face, freckles, reddish brown hair and adult age. Image 2 is Pioneer Memorial location reference: preserve its curved warm copper sci-fi museum architecture and lander exhibit. Depict the opening of The Seventeen Missing Hours: June standing beside an exhibit, comparing a maintenance record in her hand with a caption, thoughtful uncertainty, inviting the viewer to investigate. Medium-wide scene, natural hands, clear face, tactile textures, warm practical light, no excessive blur. Record text indistinct, no spoilers, no solution or supernatural phenomenon. Fully clothed. One coherent image, no panels. Save the generated asset.";
 return {index,id:s.id,title:s.title,focus:place?'both':'character',references,prompt:finalPrompt,asset:`apps/together/assets/scenarios/${s.id}.jpg`};
});
fs.writeFileSync('content/scenarios/storyline-art-prompts.json',JSON.stringify(jobs,null,2)+'\n');
const temp='.codex-temp/storyline-art';fs.mkdirSync(temp,{recursive:true});
// Review-only contact sheets; originals are passed individually to image generation.
for(let start=0;start<jobs.length;start+=4){
 const tiles=[];
 for(let j=start;j<Math.min(start+4,jobs.length);j++)for(let k=0;k<2;k++){
  const ref=jobs[j].references[k]; if(!ref)continue;
  tiles.push({input:await sharp(ref.path).resize(420,300,{fit:'contain',background:'#161616'}).toBuffer(),left:k*420,top:(j-start)*330});
  const label=Buffer.from(`<svg width="420" height="30"><rect width="420" height="30" fill="#161616"/><text x="8" y="20" fill="white" font-size="16">${j} ${k===0?'Character':'Location'}: ${jobs[j].id.replace('story-','')}</text></svg>`);
  tiles.push({input:label,left:k*420,top:(j-start)*330+300});
 }
 await sharp({create:{width:840,height:1320,channels:3,background:'#161616'}}).composite(tiles).jpeg({quality:88}).toFile(`${temp}/refs-${start}.jpg`);
}
console.log(JSON.stringify(jobs.map(j=>({...j,references:j.references.map(r=>({...r,absolutePath:path.resolve(root,r.path)}))}))));
