export const HOME_DEFERRED_WORK_DELAY_MS=450;

/**
 * Gives the first home viewport a brief head start without depending on
 * InteractionManager. Long-running hero animations can keep React Native
 * Web's interaction queue open indefinitely.
 */
export function scheduleDeferredHomeWork(onReady:()=>void,delayMs=HOME_DEFERRED_WORK_DELAY_MS):()=>void{
  const timer=setTimeout(onReady,delayMs);
  return()=>clearTimeout(timer);
}
