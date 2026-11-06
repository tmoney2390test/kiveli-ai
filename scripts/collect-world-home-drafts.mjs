import { readFile, readdir, writeFile } from 'node:fs/promises';
import { worldHomeCounts, validateWorldHomes } from './world-home-catalog.mjs';
import { editWorldHome,withResidenceSource } from '../content/homes/worlds/editorial.mjs';
const source=new Map(JSON.parse(await readFile('.test-tmp/world-home-artwork/catalog-source.json','utf8')).map(h=>[h.id,h]));
const all = await Promise.all((await readdir('.test-tmp/world-home-artwork/drafts-v2')).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(`.test-tmp/world-home-artwork/drafts-v2/${f}`,'utf8'))));
for (const world of process.argv[2] ? [process.argv[2]] : Object.keys(worldHomeCounts)) {
  const homes = all.filter(h=>h.world===world).map(h=>editWorldHome(withResidenceSource(h,source.get(h.homeId)))).sort((a,b)=>a.slug.localeCompare(b.slug));
  if (homes.length !== worldHomeCounts[world]) { console.log(`${world}: ${homes.length}/${worldHomeCounts[world]} drafted`); continue; }
  validateWorldHomes(world,homes);
  await writeFile(`content/homes/worlds/${world}.json`,JSON.stringify(homes,null,2));
  console.log(`${world}: ${homes.length} collected`);
}
