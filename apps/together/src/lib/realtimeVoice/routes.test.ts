import { describe, expect, it } from 'vitest';
import { resolvePreferredVoiceRoute, voiceRouteShellOptions } from './routes';

describe('voice route preference',()=>{
  const both=[{route:'standard' as const,available:true},{route:'express' as const,available:true}];
  it('preserves the customer-selected route when it remains available',()=>{
    expect(resolvePreferredVoiceRoute(both,'express')).toBe('express');
    expect(resolvePreferredVoiceRoute(both,'standard')).toBe('standard');
  });
  it('defaults new customers to Essential and fails over only before a call starts',()=>{
    expect(resolvePreferredVoiceRoute(both,null)).toBe('standard');
    expect(resolvePreferredVoiceRoute([{route:'standard',available:false},{route:'express',available:true}],'standard')).toBe('express');
  });
  it('never treats an invalid stored value as a route selection',()=>{
    expect(resolvePreferredVoiceRoute([{route:'standard',available:false},{route:'express',available:false}],'premium')).toBe('standard');
  });
});

describe('voice route shell',()=>{
  it('always exposes the two permanent choices without a server round trip',()=>{
    expect(voiceRouteShellOptions.map((option)=>[option.route,option.displayName])).toEqual([
      ['standard','Essential'],
      ['express','Immersive'],
    ]);
  });
});
