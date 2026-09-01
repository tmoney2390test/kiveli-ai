/** Restores the transition cover before the destination document paints. */
export const webBootstrap = `(function(){
  var transitionKey="kivelli:web-route-transition:v1";
  var transitionClass="kivelli-route-transition-pending";
  var entryHref=location.pathname+location.search+location.hash;
  globalThis.__KIVELLE_ENTRY_HREF__=entryHref;

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
