import{afterEach,describe,expect,it,vi}from'vitest';
import{HOME_DEFERRED_WORK_DELAY_MS,scheduleDeferredHomeWork}from'./homeDeferredWork';

afterEach(()=>vi.useRealTimers());

describe('deferred home work',()=>{
  it('always releases secondary home content after the bounded delay',()=>{
    vi.useFakeTimers();
    const ready=vi.fn();
    scheduleDeferredHomeWork(ready);
    vi.advanceTimersByTime(HOME_DEFERRED_WORK_DELAY_MS-1);
    expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ready).toHaveBeenCalledOnce();
  });

  it('can be cancelled when the home screen unmounts',()=>{
    vi.useFakeTimers();
    const ready=vi.fn();
    const cancel=scheduleDeferredHomeWork(ready);
    cancel();
    vi.runAllTimers();
    expect(ready).not.toHaveBeenCalled();
  });
});
