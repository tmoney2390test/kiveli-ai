import {existsSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const slugs=[
  'ren-ishikawa','jae-min-han','theo-laurent','daisuke-arata','malik-okoye',
  'adrian-petrescu','kenji-watanabe','gabriel-moreau','haruto-seki','nico-serrano',
  'sol-9','min-jun-park','tiago-nascimento','kaito-fujimori','arun-mehta',
];
const assetSource=readFileSync(`${root}/apps/together/src/assets.ts`,'utf8');
const profileSource=readFileSync(`${root}/apps/together/src/character-profile-assets.ts`,'utf8');
const failures=[];

for(const slug of slugs){
  const primary=`${root}/apps/together/assets/characters/neon-kyo/${slug}.jpg`;
  const second=`${root}/apps/together/assets/character-profile/neon-kyo/${slug}/photo-2.jpg`;
  const third=`${root}/apps/together/assets/character-profile/neon-kyo/${slug}/photo-3.jpg`;
  for(const path of [primary,second,third]){
    if(!existsSync(path)||statSync(path).size<50_000)failures.push(`Missing or undersized image: ${path}`);
  }
  if(!assetSource.includes(`characters/neon-kyo/${slug}.jpg`))failures.push(`Missing canonical asset mapping: ${slug}`);
  if(!profileSource.includes(`character-profile/neon-kyo/${slug}/photo-2.jpg`))failures.push(`Missing photo-2 mapping: ${slug}`);
  if(!profileSource.includes(`character-profile/neon-kyo/${slug}/photo-3.jpg`))failures.push(`Missing photo-3 mapping: ${slug}`);
}

if(new Set(slugs).size!==15)failures.push('Expected 15 unique NEON KYO male companion slugs.');
if(failures.length){
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`NEON KYO male cast asset audit passed: ${slugs.length} companions, ${slugs.length*3} images.`);
