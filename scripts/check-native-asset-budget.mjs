import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';

const directory=resolve(process.argv[2]??'apps/together/dist-native-size');
const assetmap=JSON.parse(await readFile(resolve(directory,'assetmap.json'),'utf8'));
// Scenario previews are intentionally bundled for the native experience. The
// previous 8 MiB limit predates that artwork; retain a bounded size check.
const limitBytes=36*1024*1024;
let bytes=0,files=0;
const seen=new Set();
for(const asset of Object.values(assetmap)) {
  if(/(?:^|\/)assets\/(?:characters|character-profile|locations|worlds)\//.test(asset.httpServerLocation??'')) throw new Error(`Catalog artwork was rebundled: ${asset.name}`);
  for(const file of asset.files??[]) {
    const path=resolve(file);
    if(seen.has(path))continue;
    seen.add(path);bytes+=(await stat(path)).size;files++;
  }
}
if(!files)throw new Error('Native asset inventory is empty or unsupported');
if(bytes>limitBytes)throw new Error(`Native assets exceed 36 MiB: ${bytes} bytes`);
console.log(JSON.stringify({files,bytes,limitBytes,catalogBundled:false}));
