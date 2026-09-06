import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{scheduleForegroundTimeout}from'./webPageLifecycle';

class FakeVisibilitySource{
  hidden=false;
  private listeners=new Set<EventListener>();
  addEventListener(_type:'visibilitychange',listener:EventListener){this.listeners.add(listener);}
  removeEventListener(_type:'visibilitychange',listener:EventListener){this.listeners.delete(listener);}
  setHidden(hidden:boolean){this.hidden=hidden;for(const listener of this.listeners)listener(new Event('visibilitychange'));}
}

describe('foreground request timeout',()=>{
  beforeEach(()=>vi.useFakeTimers());
  afterEach(()=>vi.useRealTimers());

  it('does not spend the request budget while a mobile browser tab is hidden',()=>{
    const source=new FakeVisibilitySource(),callback=vi.fn();
    scheduleForegroundTimeout(callback,10_000,source);
    vi.advanceTimersByTime(2_000);
    source.setHidden(true);
    vi.advanceTimersByTime(60_000);
    expect(callback).not.toHaveBeenCalled();
    source.setHidden(false);
    vi.advanceTimersByTime(7_999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('can be cancelled without firing after resume',()=>{
    const source=new FakeVisibilitySource(),callback=vi.fn();
    const cancel=scheduleForegroundTimeout(callback,5_000,source);
    source.setHidden(true);
    cancel();
    source.setHidden(false);
    vi.advanceTimersByTime(10_000);
    expect(callback).not.toHaveBeenCalled();
  });
});
