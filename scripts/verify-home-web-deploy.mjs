import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const routes=['home','chat','group-chat','call','scenarios'],assets=new Set();
for(const route of routes){
 const local=await readFile('apps/together/dist/'+route+'.html','utf8'),remote=await fetch('https://kivelli.app/'+route,{cache:'no-store'});
 assert.equal(remote.status,200,route);const html=await remote.text();
 const scripts=[...local.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);assert.ok(scripts.length,route);
 for(const script of scripts){assert.ok(html.includes(script),route+' stale asset '+script);assets.add(script);}
}
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const path of assets){const r=await fetch('https://kivelli.app'+path);assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile('apps/together/dist'+path)),path);}
console.log('PASS '+routes.length+' production pages, '+assets.size+' matching JavaScript assets.');
