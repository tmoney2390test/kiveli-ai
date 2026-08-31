import { describe, expect, it } from 'vitest';
import { formatVideoTime, webVideoControlButtonStyle, webVideoElementAttributes } from './WebVideoSurface';

describe('mobile web video surface',()=>{
  it('renders an inline HTML5 video with custom touch controls and explicit tap-to-play',()=>{
    const attributes=webVideoElementAttributes({uri:'https://media.example.test/video.mp4'});
    expect(attributes).toMatchObject({src:'https://media.example.test/video.mp4',controls:false,autoPlay:false,muted:true,defaultMuted:true,loop:true,playsInline:true,preload:'auto','webkit-playsinline':'true'});
    expect(attributes.style).toMatchObject({position:'absolute',inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain'});
  });

  it('uses the source photo as a poster while playback waits for a user gesture',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',posterUri:'https://media.example.test/poster.jpg'}).poster).toBe('https://media.example.test/poster.jpg');
  });

  it('does not autoplay an inactive background player',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',active:false,autoPlay:true}).autoPlay).toBe(false);
  });

  it('keeps the video surface full-size before the first play gesture',()=>{
    const attributes=webVideoElementAttributes({uri:'https://media.example.test/video.mp4',posterUri:'https://media.example.test/poster.jpg'});
    expect(attributes.poster).toBe('https://media.example.test/poster.jpg');
    expect(attributes.style).toMatchObject({width:'100%',height:'100%',objectFit:'contain'});
  });

  it('formats a stable mobile playback time label',()=>{
    expect(formatVideoTime(0)).toBe('0:00');
    expect(formatVideoTime(65.8)).toBe('1:05');
  });

  it('uses icon-only controls without pill backgrounds while preserving touch targets',()=>{
    expect(webVideoControlButtonStyle).toMatchObject({width:44,height:44,minWidth:44,minHeight:44,padding:0,border:'none',background:'transparent'});
  });
});
