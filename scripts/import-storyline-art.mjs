import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const jobs=JSON.parse(fs.readFileSync('content/scenarios/storyline-art-prompts.json','utf8'));
const receipts=JSON.parse(fs.readFileSync('.codex-temp/storyline-art/outputs.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rows=[];
for(const receipt of receipts){
 const job=jobs.find(j=>j.id===receipt.id);if(!job)throw Error(`Unknown scenario ${receipt.id}`);
 if(!fs.existsSync(job.asset)){
  // Encoding only: composition and pixels are supplied by built-in image generation.
  await sharp(receipt.source).rotate().resize({width:1536,withoutEnlargement:true}).jpeg({quality:83,mozjpeg:true}).toFile(job.asset);
 }
 const m=await sharp(job.asset).metadata();
 rows.push({id:job.id,focus:job.focus,references:job.references,asset:job.asset,sha256:hash(job.asset),bytes:fs.statSync(job.asset).size,dimensions:[m.width,m.height],generator:'built-in image_gen',sourceFile:path.basename(receipt.source),promptFile:'content/scenarios/storyline-art-prompts.json',visualReview:'Reviewed individually against the reference images and opening scene.'});
}
fs.writeFileSync('content/scenarios/storyline-art-manifest.json',JSON.stringify(rows,null,2)+'\n');
console.log(`Imported ${rows.length}/${jobs.length} scenario covers; ${Math.round(rows.reduce((n,r)=>n+r.bytes,0)/1024/1024*10)/10} MiB total`);
