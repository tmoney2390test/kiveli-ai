import { describe, expect, it } from 'vitest';
import { webVideoElementAttributes } from './WebVideoSurface';

describe('mobile web video surface',()=>{
  it('renders an inline HTML5 video with custom touch controls and autoplay-safe muting',()=>{
    const attributes=webVideoElementAttributes({uri:'https://media.example.test/video.mp4'});
    expect(attributes).toMatchObject({src:'https://media.example.test/video.mp4',controls:false,autoPlay:true,muted:true,defaultMuted:true,loop:true,playsInline:true,preload:'metadata','webkit-playsinline':'true'});
    expect(attributes.style).toMatchObject({position:'absolute',inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain'});
  });

  it('uses the source photo as a poster while playback waits for a user gesture',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',posterUri:'https://media.example.test/poster.jpg'}).poster).toBe('https://media.example.test/poster.jpg');
  });

  it('does not autoplay an inactive background player',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',active:false}).autoPlay).toBe(false);
  });
});
