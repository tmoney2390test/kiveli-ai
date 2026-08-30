import { describe, expect, it } from 'vitest';
import type { VideoGenerationOptions } from '../types';
import { directVideoLocationReady, selectedDirectVideoLocation } from './directVideoLocation';

const options={locationOptions:{defaultSource:'current',worldId:'world-1',worldName:'Vesper City',current:{source:'current',locationId:'current-1',name:'Moonlight Cafe',worldId:'world-1',worldName:'Vesper City'},home:{source:'home',locationId:null,name:'Bianca’s apartment',worldId:'world-1',worldName:'Vesper City'},places:[{source:'place',locationId:'place-1',name:'Orion Square',worldId:'world-1',worldName:'Vesper City'}]}} as VideoGenerationOptions;

describe('direct video locations',()=>{
  it('defaults to the authoritative current place and supports home',()=>{
    expect(selectedDirectVideoLocation(options,'current')?.name).toBe('Moonlight Cafe');
    expect(selectedDirectVideoLocation(options,'home')?.name).toBe('Bianca’s apartment');
  });

  it('requires an exact world-scoped place selection',()=>{
    expect(directVideoLocationReady(options,'place','')).toBe(false);
    expect(directVideoLocationReady(options,'place','outside-world')).toBe(false);
    expect(selectedDirectVideoLocation(options,'place','place-1')?.name).toBe('Orion Square');
  });
});
