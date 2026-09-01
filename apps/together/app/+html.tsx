import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const webBootstrap = `(function(){
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
        if(guardActive&&args.length>2&&args[2]!=null){
          try{
            var nextUrl=new URL(String(args[2]),location.href);
            var transientRoot=(nextUrl.pathname==="/"||nextUrl.pathname==="/home")&&nextUrl.pathname!==entryUrl.pathname;
            if(transientRoot)args[2]=entryHref;
          }catch(error){}
        }
        return method.apply(history,args);
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

const globalStyles = `html,body,#root{height:100%;background:#08070D}
body{margin:0;overflow:hidden;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
input,textarea,button{font:inherit}
button,a,[role=button]{cursor:pointer}
html.kivelli-route-transition-pending body:before{content:"";position:fixed;inset:0;z-index:2147483646;background:radial-gradient(circle at 50% 46%,rgba(126,37,131,.16),transparent 30%),#08070D;pointer-events:auto}
html.kivelli-route-transition-pending body:after{content:"";position:fixed;left:50%;top:50%;z-index:2147483647;width:30px;height:30px;margin:-15px 0 0 -15px;border:2px solid rgba(255,255,255,.16);border-top-color:#ef5ad7;border-right-color:#925cff;border-radius:50%;animation:kivelli-route-spin .8s linear infinite;pointer-events:none}
@keyframes kivelli-route-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){html.kivelli-route-transition-pending body:after{animation-duration:1.8s}}`;

export default function Root({ children }: PropsWithChildren) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#08070D" />
      <meta name="description" content="Kivelle.AI — a relationship that keeps living." />
      <title>Kivelle.AI</title>
      <script dangerouslySetInnerHTML={{ __html: webBootstrap }} />
      <ScrollViewStyleReset />
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
    </head>
    <body>{children}</body>
  </html>;
}
