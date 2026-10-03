import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{scheduleForegroundTimeout,waitForWebPageVisible}from'./webPageLifecycle';

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

describe('waiting for a visible tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('removes visibility and pageshow listeners when cancelled while hidden', async () => {
    const page = Object.assign(new EventTarget(), { hidden: true });
    const browser = new EventTarget();
    vi.stubGlobal('document', page); vi.stubGlobal('window', browser);
    const pageRemove = vi.spyOn(page, 'removeEventListener');
    const browserRemove = vi.spyOn(browser, 'removeEventListener');
    const controller = new AbortController();
    const pending = waitForWebPageVisible(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(pageRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(browserRemove).toHaveBeenCalledWith('pageshow', expect.any(Function));
  });

  it('waits until visible and removes the abort listener on success', async () => {
    const page = Object.assign(new EventTarget(), { hidden: true });
    vi.stubGlobal('document', page); vi.stubGlobal('window', new EventTarget());
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    let settled = false;
    const pending = waitForWebPageVisible(controller.signal).then(() => { settled = true; });
    page.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve(); expect(settled).toBe(false);
    page.hidden = false; page.dispatchEvent(new Event('visibilitychange'));
    await pending;
    expect(settled).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects an already cancelled wait even on a visible or native page', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(waitForWebPageVisible(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
