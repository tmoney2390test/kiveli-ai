import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebVideoSurface, webVideoElementAttributes, webVideoElementStyle } from './WebVideoSurface';

describe('mobile web video surface',()=>{
  it('renders an inline HTML5 video with custom touch controls and explicit tap-to-play',()=>{
    const attributes=webVideoElementAttributes({uri:'https://media.example.test/video.mp4'});
    expect(attributes).toMatchObject({src:'https://media.example.test/video.mp4',controls:false,autoPlay:false,muted:true,defaultMuted:true,loop:true,playsInline:true,preload:'metadata','webkit-playsinline':'true'});
    expect(attributes.style).toMatchObject({position:'absolute',inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain'});
  });

  it('uses the source photo as a poster while playback waits for a user gesture',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',posterUri:'https://media.example.test/poster.jpg'}).poster).toBe('https://media.example.test/poster.jpg');
  });

  it('does not autoplay an inactive background player',()=>{
    expect(webVideoElementAttributes({uri:'https://media.example.test/video.mp4',active:false,autoPlay:true}).autoPlay).toBe(false);
  });

  it('keeps the hardware video surface offscreen until the user starts playback',()=>{
    expect(webVideoElementStyle(false)).toMatchObject({width:1,height:1,opacity:0,pointerEvents:'none'});
    expect(webVideoElementStyle(true)).toMatchObject({width:'100%',height:'100%',objectFit:'contain'});
  });

  it('renders a visible play action before exposing the mobile hardware video surface',()=>{
    const markup=renderToStaticMarkup(createElement(WebVideoSurface,{uri:'https://media.example.test/video.mp4',posterUri:'https://media.example.test/poster.jpg',accessibilityLabel:'Video from Bianca'}));
    expect(markup).toContain('data-kivelli-video-player="3"');
    expect(markup).toContain('aria-label="Play video"');
    expect(markup).toContain('src="https://media.example.test/poster.jpg"');
    expect(markup).toContain('width:1px;height:1px;opacity:0');
  });
});
