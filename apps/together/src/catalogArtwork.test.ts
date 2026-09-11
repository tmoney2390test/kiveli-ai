import {describe,expect,it} from 'vitest';
import {CATALOG_ARTWORK_BASE,catalogArtwork,catalogThumbnail,catalogImagePresentation} from './catalogArtwork';
import {KIVELLI_IMAGE_PLACEHOLDER} from './lib/imageWarmup';
import manifest from './catalog-artwork.json';

describe('on-demand catalog artwork',()=>{
  it('keeps a local neutral fallback on failure and resets on image change/reconnect',()=>{
    const source=catalogArtwork('characters/vharadren/princess-maris-vaelorian.png');
    expect(catalogImagePresentation(source).source).toBe(source);
    expect(catalogImagePresentation(source,source.uri).source).toBe(KIVELLI_IMAGE_PLACEHOLDER);
    expect(catalogImagePresentation(source,'https://different.test/image.webp').source).toBe(source);
    expect(catalogImagePresentation(source,undefined).source).toBe(source);
    const privateSource={uri:'https://example.test/private?token=secret'};
    expect(catalogImagePresentation(privateSource,privateSource.uri)).toEqual({uri:privateSource.uri,isCatalog:false,source:privateSource});
  });
  it('resolves every registered image to a versioned public display copy',()=>{
    for(const path of Object.keys(manifest) as Array<keyof typeof manifest>){
      const source=catalogArtwork(path);
      expect(source.uri).toMatch(new RegExp(`^${CATALOG_ARTWORK_BASE.replaceAll('.','\\.')}v1/[a-f0-9]{64}\\.webp$`));
      expect(source.cacheKey).toBe(`kivelli-catalog:${manifest[path].display.file}`);
      expect(source.width).toBeGreaterThan(0);
      expect(source.height).toBeGreaterThan(0);
    }
  });
  it('uses a separate smaller cached variant for avatars without changing full-view images',()=>{
    const full=catalogArtwork('characters/vharadren/princess-maris-vaelorian.png');
    const small=catalogArtwork('characters/vharadren/princess-maris-vaelorian.png','thumbnail');
    expect(catalogThumbnail(full)).toEqual(small);
    expect(small.uri).not.toBe(full.uri);
    expect(Math.max(small.width!,small.height!)).toBeLessThanOrEqual(384);
    expect(catalogThumbnail(small)).toBe(small);
  });
  it('never rewrites private URLs, uploaded photos, unknown URLs or packaged fallbacks',()=>{
    for(const source of [undefined,12,{uri:'https://example.test/private/photo?token=private'},{uri:'file:///photo.jpg'},{uri:`${CATALOG_ARTWORK_BASE}not-registered.webp`}]) expect(catalogThumbnail(source)).toBe(source);
  });
});
