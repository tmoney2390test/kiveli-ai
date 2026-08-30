import { describe, expect, it } from 'vitest';
import { webVideoElementAttributes } from './WebVideoSurface';

describe('mobile web video surface',()=>{
  it('renders a real inline HTML5 video with native controls and autoplay-safe muting',()=>{
    const attributes=webVideoElementAttributes({uri:'https://media.example.test/video.mp4'});
    expect(attributes).toMatchObject({src:'https://media.example.test/video.mp4',controls:true,autoPlay:true,muted:true,loop:true,playsInline:true,preload:'auto'});
    expect(attributes.style).toMatchObject({position:'absolute',inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain'});
  });

  it('does not autoplay an inactive background player',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',active:false}).autoPlay).toBe(false);
  });
});
