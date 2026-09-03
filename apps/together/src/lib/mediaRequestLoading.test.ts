import{describe,expect,it}from'vitest';
import{shouldLoadDirectVideoOptions}from'./mediaRequestLoading';

describe('media request loading',()=>{
  it('does not load video configuration while the default photo composer is open',()=>{
    expect(shouldLoadDirectVideoOptions({visible:true,mode:'photo',characterId:'iris',loadedCharacterId:null})).toBe(false);
  });

  it('loads video configuration only after Video is selected and reuses it for the same companion',()=>{
    expect(shouldLoadDirectVideoOptions({visible:true,mode:'video',characterId:'iris',loadedCharacterId:null})).toBe(true);
    expect(shouldLoadDirectVideoOptions({visible:true,mode:'video',characterId:'iris',loadedCharacterId:'iris'})).toBe(false);
    expect(shouldLoadDirectVideoOptions({visible:true,mode:'video',characterId:'elena',loadedCharacterId:'iris'})).toBe(true);
  });
});
