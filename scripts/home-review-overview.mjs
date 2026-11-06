// Compact panels of the same numbered sheets, for review at screen resolution.
import sharp from 'sharp';
import {resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
const [world]=process.argv.slice(2);
const dir=resolve('.test-tmp/world-home-artwork',world,'review-sheets');
const sheets=(await readdir(dir)).filter(s=>/^sheet-\d+\.jpg$/.test(s)).sort((a,b)=>parseInt(a.slice(6))-parseInt(b.slice(6)));
for(let i=0;i<sheets.length;i+=4){
  const batch=sheets.slice(i,i+4),layers=[];
  for(const [n,filename] of batch.entries())layers.push({input:await sharp(resolve(dir,filename)).resize({width:654}).jpeg().toBuffer(),left:(n%2)*654,top:Math.floor(n/2)*483});
  await sharp({create:{width:batch.length>1?1308:654,height:Math.ceil(batch.length/2)*483,channels:3,background:'#17131e'}}).composite(layers).jpeg({quality:87}).toFile(resolve(dir,'overview-'+(i+1)+'.jpg'));
}
