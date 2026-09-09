import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptCaldersRun} from './lib/calders-run-adapter.mjs';
import {generateCaldersMigration} from './generate-calders-run-content.mjs';

const pack=JSON.parse(readFileSync('content/calders-run/calders_run_content_pack.json','utf8'));
const adapted=adaptCaldersRun(pack),schema=JSON.parse(readFileSync('scripts/fixtures/calders-schema.json','utf8'));
const directory=resolve('../calders-import-parts');mkdirSync(directory,{recursive:true});
let index=0;const parts=[];
for(const [table,rows] of Object.entries(adapted.records)){
  let batch=[],size=0;
  const flush=()=>{if(!batch.length)return;const path=resolve(directory,`${String(++index).padStart(3,'0')}-${table}.sql`);writeFileSync(path,generateCaldersMigration({...adapted,records:{[table]:batch}},schema,false));parts.push({path,table,rows:batch.length});batch=[];size=0;};
  for(const row of rows){const bytes=Buffer.byteLength(JSON.stringify(row));if(size+bytes>120_000)flush();batch.push(row);size+=bytes;}
  flush();
}
const path=resolve(directory,`${String(++index).padStart(3,'0')}-arrival.sql`);
writeFileSync(path,`update together_worlds set default_arrival_location_id='${adapted.arrivalId}' where id='${adapted.worldId}';`);
parts.push({path,table:'arrival',rows:1});
writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(parts,null,2));
console.log(JSON.stringify({parts:parts.length,directory,published:false}));
