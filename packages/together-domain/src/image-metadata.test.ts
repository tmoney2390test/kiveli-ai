import{describe,expect,it}from'vitest';
import{imageDimensions}from'./image-metadata.ts';

describe('imageDimensions',()=>{
  it('reads PNG dimensions',()=>{
    const bytes=new Uint8Array(24);bytes.set([0x89,0x50],0);bytes.set([0x49,0x48,0x44,0x52],12);bytes.set([0,0,4,0,0,0,3,0],16);
    expect(imageDimensions(bytes,'image/png')).toEqual({width:1024,height:768});
  });
  it('reads JPEG dimensions from a start-of-frame segment',()=>{
    const bytes=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,2,0xff,0xc0,0,17,8,3,0,4,0,3,1,1,0,2,1,0,3,1,0]);
    expect(imageDimensions(bytes,'image/jpeg')).toEqual({width:1024,height:768});
  });
  it('reads extended WebP dimensions',()=>{
    const bytes=new Uint8Array(30);bytes.set([0x52,0x49,0x46,0x46],0);bytes.set([0x57,0x45,0x42,0x50],8);bytes.set([0x56,0x50,0x38,0x58],12);bytes.set([0xff,0x03,0,0xff,0x02,0],24);
    expect(imageDimensions(bytes,'image/webp')).toEqual({width:1024,height:768});
  });
  it('rejects invalid and unsupported inputs',()=>expect(imageDimensions(new Uint8Array([1,2,3]),'image/png')).toBeNull());
});
