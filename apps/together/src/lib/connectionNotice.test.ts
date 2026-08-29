import{describe,expect,it}from'vitest';
import{connectionBannerMode}from'./connectionNotice';

describe('send-scoped connection notices',()=>{
  it('keeps ordinary disconnect and reconnect probes silent',()=>{
    expect(connectionBannerMode({phase:'offline',sendFailed:false,sendScoped:false})).toBeNull();
    expect(connectionBannerMode({phase:'reconnected',sendFailed:false,sendScoped:false})).toBeNull();
  });

  it('shows connectivity only after a send observes that state',()=>{
    expect(connectionBannerMode({phase:'offline',sendFailed:false,sendScoped:true})).toBe('offline');
    expect(connectionBannerMode({phase:'reconnected',sendFailed:false,sendScoped:true})).toBe('reconnected');
  });

  it('preserves failed-message recovery without a connectivity notice',()=>{
    expect(connectionBannerMode({phase:'online',sendFailed:true,sendScoped:false})).toBe('failed');
    expect(connectionBannerMode({phase:'offline',sendFailed:true,sendScoped:false})).toBe('failed');
  });
});
