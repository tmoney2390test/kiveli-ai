import{describe,expect,it}from'vitest';
import{privateMediaPlaybackUrl}from'./privateMediaUrl';

describe('private media playback URLs',()=>{
  const signed='https://project.supabase.co/storage/v1/object/sign/private/video.mp4?token=secret';

  it('uses the same-origin Supabase gateway for web playback',()=>{
    expect(privateMediaPlaybackUrl(signed,'web','https://kivelli.app/supabase')).toBe('https://kivelli.app/supabase/storage/v1/object/sign/private/video.mp4?token=secret');
  });

  it('keeps direct storage delivery for native apps and local direct configurations',()=>{
    expect(privateMediaPlaybackUrl(signed,'android','https://kivelli.app/supabase')).toBe(signed);
    expect(privateMediaPlaybackUrl(signed,'web','https://project.supabase.co')).toBe(signed);
  });

  it('does not rewrite unrelated private URLs',()=>{
    const unrelated='https://media.example.test/video.mp4';
    expect(privateMediaPlaybackUrl(unrelated,'web','https://kivelli.app/supabase')).toBe(unrelated);
  });
});
