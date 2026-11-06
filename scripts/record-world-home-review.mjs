// Only run after inspecting the named sheets. Original artwork never changes.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { worldHomeCounts } from './world-home-catalog.mjs';
const [world,sheets]=process.argv.slice(2);
if(!worldHomeCounts[world]||!sheets)throw Error('Pass world slug and comma-separated sheet numbers that were visually inspected');
const root=resolve('.test-tmp/world-home-artwork'),out=resolve('content/homes/reviewed');await mkdir(out,{recursive:true});
const index=JSON.parse(await readFile(resolve(root,world,'review-sheets/index.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,`${world}-manifest.json`),'utf8'));
const numbers=[...new Set(sheets.split(',').map(Number))].sort((a,b)=>a-b);
if(numbers.length!==Math.ceil(index.length/9)||numbers.some((n,i)=>n!==i+1))throw Error('Every image sheet must be reviewed before approval');
const files=new Set(index);if(files.size!==worldHomeCounts[world]||manifest.length!==files.size)throw Error('Incomplete roster or multiple candidate images; inspect individual candidates');
const hashes=new Set();for(const f of await readdir(out)){if(f===`${world}.json`||!f.endsWith('.json'))continue;for(const row of JSON.parse(await readFile(resolve(out,f),'utf8')))hashes.add(row.sha256);}
const reviewed=[];
for(const m of manifest){if(!files.has(basename(m.file))||!m.thumbnailUrl)throw Error(`Missing reviewed original or thumbnail: ${m.slug}`);
 const bytes=await readFile(m.file),meta=await sharp(bytes).metadata(),sha256=createHash('sha256').update(bytes).digest('hex');
 if(hashes.has(sha256))throw Error(`Duplicate image: ${m.slug}`);hashes.add(sha256);
 if(meta.width!==m.width||meta.height!==m.height||meta.width<1024||meta.width<=meta.height)throw Error(`Invalid image dimensions: ${m.slug}`);
 const {file,...entry}=m;reviewed.push({...entry,sha256,approved:true});
}
reviewed.sort((a,b)=>a.slug.localeCompare(b.slug));await writeFile(resolve(out,`${world}.json`),JSON.stringify(reviewed,null,2)+'\n');
console.log(`Recorded ${reviewed.length} individually verified original images and thumbnails for ${world}.`);
