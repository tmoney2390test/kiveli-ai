import { describe,expect,it } from 'vitest';
import { callReturnHref } from './callNavigation';

describe('call navigation',()=>{
  it('returns directly to the originating character chat after a refreshed call route',()=>{
    expect(callReturnHref('avery-instance')).toBe('/chat?character=avery-instance');
  });
  it('falls back to the most recent chat when character context is unavailable',()=>{
    expect(callReturnHref()).toBe('/chat');
  });
});
