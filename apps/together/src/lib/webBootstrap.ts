/** Protects the requested entry URL and restores the transition cover before paint. */
export const webBootstrap = `(function(){
  var transitionKey="kivelli:web-route-transition:v1";
  var transitionClass="kivelli-route-transition-pending";
  var entryHref=location.pathname+location.search+location.hash;
  globalThis.__KIVELLE_ENTRY_HREF__=entryHref;

  try{
    var entryUrl=new URL(entryHref,location.origin);
    if(entryUrl.pathname!=="/"&&entryUrl.pathname!=="/home"){
      var originalPushState=history.pushState;
      var originalReplaceState=history.replaceState;
      var releaseHistoryGuard;
      var preserveEntry=function(method,args){
        if(args.length>2&&args[2]!=null){
          try{
            var nextUrl=new URL(String(args[2]),location.href);
            if(nextUrl.pathname==="/"||nextUrl.pathname==="/home")args[2]=entryHref;
          }catch(error){}
        }
        return method.apply(history,args);
      };
      history.pushState=function(){return preserveEntry(originalPushState,arguments)};
      history.replaceState=function(){return preserveEntry(originalReplaceState,arguments)};
      releaseHistoryGuard=function(){
        if(globalThis.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__!==releaseHistoryGuard)return;
        history.pushState=originalPushState;
        history.replaceState=originalReplaceState;
        delete globalThis.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__;
      };
      globalThis.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__=releaseHistoryGuard;
      setTimeout(function(){releaseHistoryGuard()},15000);
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
