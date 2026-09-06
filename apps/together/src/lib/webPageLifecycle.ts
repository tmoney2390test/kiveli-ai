type VisibilitySource={
  readonly hidden:boolean;
  addEventListener(type:'visibilitychange',listener:EventListener):void;
  removeEventListener(type:'visibilitychange',listener:EventListener):void;
};

function currentVisibilitySource():VisibilitySource|null{
  return typeof document==='undefined'?null:document;
}

/**
 * Mobile browsers suspend timers while a tab is backgrounded. A normal
 * setTimeout then expires as soon as the screen wakes, even though almost no
 * usable request time elapsed. This timer deliberately counts foreground time.
 */
export function scheduleForegroundTimeout(callback:()=>void,delayMs:number,source:VisibilitySource|null=currentVisibilitySource()):()=>void{
  let remaining=Math.max(0,delayMs),startedAt=0,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  const clearTimer=()=>{if(timer!==undefined){clearTimeout(timer);timer=undefined;}};
  const dispose=()=>{if(disposed)return;disposed=true;clearTimer();source?.removeEventListener('visibilitychange',onVisibility);};
  const finish=()=>{if(disposed)return;dispose();callback();};
  const arm=()=>{
    if(disposed||source?.hidden||timer!==undefined)return;
    if(remaining<=0){finish();return;}
    startedAt=Date.now();
    timer=setTimeout(finish,remaining);
  };
  const onVisibility=()=>{
    if(source?.hidden){
      if(timer!==undefined){remaining=Math.max(0,remaining-(Date.now()-startedAt));clearTimer();}
      return;
    }
    arm();
  };
  source?.addEventListener('visibilitychange',onVisibility);
  arm();
  return dispose;
}

export function waitForWebPageVisible():Promise<void>{
  const source=currentVisibilitySource();
  if(!source?.hidden)return Promise.resolve();
  return new Promise((resolve)=>{
    const finish=()=>{
      if(source.hidden)return;
      source.removeEventListener('visibilitychange',onVisibility);
      if(typeof window!=='undefined')window.removeEventListener('pageshow',onPageShow);
      resolve();
    };
    const onVisibility=()=>finish();
    const onPageShow=()=>finish();
    source.addEventListener('visibilitychange',onVisibility);
    if(typeof window!=='undefined')window.addEventListener('pageshow',onPageShow);
  });
}

/** Calls back after a suspended mobile-web page becomes usable again. */
export function subscribeToWebPageResume(callback:()=>void):()=>void{
  if(typeof document==='undefined'||typeof window==='undefined')return()=>undefined;
  const onVisible=()=>{if(!document.hidden)callback();};
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('pageshow',onVisible);
  return()=>{
    document.removeEventListener('visibilitychange',onVisible);
    window.removeEventListener('pageshow',onVisible);
  };
}
