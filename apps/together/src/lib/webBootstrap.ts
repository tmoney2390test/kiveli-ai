/** Runs in the document head before Expo can rewrite a static deep-link URL. */
export const webBootstrap = `(function(){
  var transitionKey="kivelli:web-route-transition:v1";
  var transitionClass="kivelli-route-transition-pending";
  var entryHref=location.pathname+location.search+location.hash;
  globalThis.__KIVELLE_ENTRY_HREF__=entryHref;

  try{
    var entryUrl=new URL(entryHref,location.origin);
    if(entryUrl.pathname!=="/"){
      var originalPushState=history.pushState;
      var originalReplaceState=history.replaceState;
      var guardActive=true;
      var releaseGuard=function(){
        if(!guardActive)return;
        guardActive=false;
        history.pushState=originalPushState;
        history.replaceState=originalReplaceState;
      };
      var preserveEntry=function(method,args){
        var restoreEntry=false;
        if(guardActive&&args.length>2&&args[2]!=null){
          try{
            var nextUrl=new URL(String(args[2]),location.href);
            var transientRoot=(nextUrl.pathname==="/"||nextUrl.pathname==="/home")&&nextUrl.pathname!==entryUrl.pathname;
            restoreEntry=transientRoot;
          }catch(error){}
        }
        var result=method.apply(history,args);
        if(restoreEntry){
          queueMicrotask(function(){
            if(!guardActive)return;
            var currentPath=location.pathname;
            if(currentPath==="/"||currentPath==="/home")originalReplaceState.call(history,history.state,"",entryHref);
          });
        }
        return result;
      };
      history.pushState=function(){return preserveEntry(originalPushState,arguments)};
      history.replaceState=function(){return preserveEntry(originalReplaceState,arguments)};
      globalThis.__KIVELLE_RELEASE_ENTRY_HISTORY_GUARD__=releaseGuard;
    }
  }catch(error){}

  try{
    var rawTransition=sessionStorage.getItem(transitionKey);
    var pending=rawTransition&&JSON.parse(rawTransition);
    var destination=pending&&typeof pending.destination==="string"?new URL(pending.destination,location.origin):null;
    var fresh=pending&&typeof pending.startedAt==="number"&&Date.now()-pending.startedAt<15000;
    if(destination&&fresh&&destination.pathname===location.pathname){
      globalThis.__KIVELLE_PENDING_ROUTE_HREF__=pending.destination;
      document.documentElement.classList.add(transitionClass);
      globalThis.__KIVELLE_PENDING_ROUTE_TIMEOUT__=setTimeout(function(){
        try{sessionStorage.removeItem(transitionKey)}catch(error){}
        document.documentElement.classList.remove(transitionClass);
        delete globalThis.__KIVELLE_PENDING_ROUTE_HREF__;
      },15000);
    }else if(rawTransition){
      sessionStorage.removeItem(transitionKey);
    }
  }catch(error){
    try{sessionStorage.removeItem(transitionKey)}catch(storageError){}
  }
})();`;
