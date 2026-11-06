// A small release preview made exclusively from the actual reviewed catalog originals.
import sharp from 'sharp';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {loadWorldHomes} from './world-home-catalog.mjs';
const picks=[
 ['calders-run','mabel-arnett',"Calder’s Run"],['gilded-coast','keon-flint','The Gilded Coast'],
 ['juniper-city','amara-okafor','Juniper City'],['neon-kyo','adrian-petrescu','Neon Kyo'],
 ['northvale','yusuf-demir','NorthVale'],['port-vervelle','chiara-bellomo','Port Vervelle'],
 ['vespormoor','willa-night','Vespormoor'],['vharadren','admiral-nyra-greymere','Vharadren']];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const layers=[],w=540,photo=310,label=72,gap=12;
for(const [i,[world,slug,worldName]] of picks.entries()){
 const home=(await loadWorldHomes(world)).find(h=>h.slug===slug);
 const review=JSON.parse(await readFile('.test-tmp/world-home-artwork/'+world+'-manifest.json','utf8')).find(h=>h.slug===slug);
 if(!home||!review)throw Error('Incomplete preview: '+world+'/'+slug);
 const left=gap+(i%2)*(w+gap),top=gap+Math.floor(i/2)*(photo+label+gap);
 layers.push({input:await sharp(review.file).resize(w,photo,{fit:'cover'}).jpeg().toBuffer(),left,top});
 const caption='<svg width="'+w+'" height="'+label+'"><rect width="100%" height="100%" fill="#1d1820"/><text x="16" y="22" font-family="Arial" font-size="14" letter-spacing="2" fill="#e0bda8">'+esc(worldName.toUpperCase())+'</text><text x="16" y="52" font-family="Georgia" font-size="23" fill="#fcf6ec">'+esc(home.name)+'</text></svg>';
 layers.push({input:Buffer.from(caption),left,top:top+photo});
}
const output=resolve(process.argv[2]??'.test-tmp/world-home-artwork/character-homes-preview.jpg');await mkdir(dirname(output),{recursive:true});
await sharp({create:{width:2*w+3*gap,height:4*(photo+label+gap)+gap,channels:3,background:'#0d0a0f'}}).composite(layers).jpeg({quality:89}).toFile(output);console.log(output);
