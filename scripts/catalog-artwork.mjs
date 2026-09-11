import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const manifestPath = resolve(root, 'apps/together/src/catalog-artwork.json');
export const runtimePath = resolve(root, 'apps/together/src/catalog-artwork.runtime.json');
export const outputPath = resolve(root, '.codex-temp/catalog-artwork');
export const bucket = 'kivelli-catalog';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function allowedCatalogPath(path) {
  return /^(?:(?:characters|character-profile|locations|worlds)\/[a-z0-9/-]+|(?:maya|chloe|alex)-portrait)\.(?:jpg|jpeg|png|webp)$/.test(path) && !path.includes('..');
}
export async function registryFiles() {
  const src = resolve(root, 'apps/together/src');
  return [resolve(src, 'assets.ts'), resolve(src, 'character-profile-assets.ts'),
    ...(await Promise.all(['location-assets', 'world-assets'].map(async dir =>
      (await readdir(resolve(src, dir))).filter(name => name.endsWith('.ts') && !name.includes('.test.')).map(name => resolve(src, dir, name))))).flat()];
}
export async function referencedPaths() {
  const paths = new Set();
  for (const file of await registryFiles()) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/catalogArtwork\('([^']+)'\)/g)) {
      if (!allowedCatalogPath(match[1])) throw new Error(`Non-catalog asset: ${match[1]}`);
      paths.add(match[1]);
    }
  }
  if (!paths.size) throw new Error('No catalog references found');
  return [...paths].sort();
}
async function generate() {
  await generateStartup();
  await mkdir(outputPath, {recursive:true});
  const manifest = {};
  let originalBytes=0, displayBytes=0, thumbnailBytes=0, done=0;
  for (const path of await referencedPaths()) {
    const bytes = await readFile(resolve(root, 'apps/together/assets', path));
    const variants = {};
    for (const [variant, dimension, quality] of [['display',1920,86], ['thumbnail',384,80]]) {
      // Display copies only. Keep original composition, alpha and source files;
      // auto-orient and remove EXIF (including any location metadata).
      const {data, info} = await sharp(bytes).rotate().resize({width:dimension,height:dimension,fit:'inside',withoutEnlargement:true}).webp({quality,effort:4}).toBuffer({resolveWithObject:true});
      const file = `v1/${sha256(data)}.webp`;
      await mkdir(resolve(outputPath, 'v1'), {recursive:true});
      await writeFile(resolve(outputPath, file), data);
      variants[variant]={file,width:info.width,height:info.height,bytes:data.length};
    }
    manifest[path]={sourceHash:sha256(bytes),...variants};
    originalBytes+=bytes.length; displayBytes+=variants.display.bytes; thumbnailBytes+=variants.thumbnail.bytes;
    if (++done % 100 === 0) console.log(`Optimized ${done} catalog images`);
  }
  await writeFile(manifestPath, JSON.stringify(manifest,null,2)+'\n');
  await writeFile(runtimePath, JSON.stringify(runtimeManifest(manifest))+'\n');
  console.log(JSON.stringify({images:done,originalBytes,displayBytes,thumbnailBytes}));
}
function runtimeManifest(manifest) {
  return Object.fromEntries(Object.entries(manifest).map(([path,entry])=>[path,Object.fromEntries(['display','thumbnail'].map(variant=>{
    const {file,width,height}=entry[variant];return [variant,{file,width,height}];
  }))]));
}
async function generateStartup() {
  const target=resolve(root,'apps/together/assets/startup');
  await mkdir(target,{recursive:true});
  await sharp(resolve(root,'apps/together/assets/characters/vespormoor/evelyn-harrow.jpg')).rotate().resize({width:1440,height:1440,fit:'inside',withoutEnlargement:true}).webp({quality:86,effort:4}).toFile(resolve(target,'welcome.webp'));
}
export async function verifyManifest() {
  const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
  if(JSON.stringify(JSON.parse(await readFile(runtimePath,'utf8')))!==JSON.stringify(runtimeManifest(manifest)))throw new Error('Runtime catalog manifest is stale');
  const paths = await referencedPaths();
  if(JSON.stringify(paths)!==JSON.stringify(Object.keys(manifest).sort())) throw new Error('Catalog manifest/reference drift; run pnpm artwork:generate');
  for(const path of paths) {
    if(sha256(await readFile(resolve(root,'apps/together/assets',path)))!==manifest[path].sourceHash) throw new Error(`Stale artwork manifest: ${path}`);
    for(const variant of ['display','thumbnail']) {
      const asset=manifest[path][variant];
      if(!/^v1\/[a-f0-9]{64}\.webp$/.test(asset.file)||asset.width<=0||asset.height<=0||Math.max(asset.width,asset.height)>(variant==='display'?1920:384)||asset.bytes<=0) throw new Error(`Invalid catalog entry: ${path}`);
    }
  }
  console.log(`Verified ${paths.length} catalog entries; original files unchanged`);
  return manifest;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--verify')) await verifyManifest();
  else if(process.argv.includes('--runtime-only')) await writeFile(runtimePath,JSON.stringify(runtimeManifest(JSON.parse(await readFile(manifestPath,'utf8'))))+'\n');
  else if(process.argv.includes('--startup-only')) await generateStartup(); else await generate();
}
