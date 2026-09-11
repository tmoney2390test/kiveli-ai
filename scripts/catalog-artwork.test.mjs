import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedCatalogPath,referencedPaths,verifyManifest} from './catalog-artwork.mjs';

test('only reviewed built-in catalog directories may be published',()=>{
  assert.equal(allowedCatalogPath('characters/vharadren/princess-maris-vaelorian.png'),true);
  for(const path of ['../secret.png','characters/../../private.png','uploads/user.jpg','generated/photo.jpg','https://example.test/image.jpg','characters/person.svg','characters\\person.jpg'])assert.equal(allowedCatalogPath(path),false);
});
test('all source references have current immutable optimized variants',async()=>{
  const manifest=await verifyManifest();
  assert.ok((await referencedPaths()).length>1100);
  assert.equal(Object.keys(manifest).some(path=>path.includes('private')),false);
});
