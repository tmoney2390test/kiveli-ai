// Non-destructive contact sheets for human review; canonical originals remain unchanged.
import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const source=resolve(process.argv[2]??'.test-tmp/eos-home-artwork');
const output=resolve(source,'review-sheets');
await mkdir(output,{recursive:true});
const files=(await readdir(source)).filter(f=>/\.(webp|png|jpg)$/.test(f)).sort();
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const size=9,width=480,height=320,label=34;
for(let offset=0;offset<files.length;offset+=size){
  const batch=files.slice(offset,offset+size),layers=[];
  for(let i=0;i<batch.length;i++){
    const x=(i%3)*width,y=Math.floor(i/3)*(height+label),name=batch[i].split('--')[0];
    layers.push({input:await sharp(resolve(source,batch[i])).resize(width,height,{fit:'inside'}).toBuffer(),left:x,top:y});
    layers.push({input:Buffer.from(`<svg width="${width}" height="${label}"><rect width="100%" height="100%" fill="#17131e"/><text x="12" y="23" fill="#fff8f4" font-family="Arial" font-size="18">${offset+i+1}. ${escape(name)}</text></svg>`),left:x,top:y+height});
  }
  const path=resolve(output,`sheet-${Math.floor(offset/size)+1}.jpg`);
  await sharp({create:{width:width*3,height:Math.ceil(batch.length/3)*(height+label),channels:3,background:'#08070d'}}).composite(layers).jpeg({quality:88}).toFile(path);
}
await writeFile(resolve(output,'index.json'),JSON.stringify(files,null,2));
console.log(`Prepared ${Math.ceil(files.length/size)} review sheets for ${files.length} images.`);
