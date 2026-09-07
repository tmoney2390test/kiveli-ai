import Head from 'expo-router/head';
import { router } from 'expo-router';
import { PUBLIC_LANDING_COPY } from '../../lib/publicLanding';
import { joinPathFor } from '../../lib/sessionRouting';
import { KivelleLogo } from '../KivelleLogo';
import { publicLandingPrimaryHeroUri } from './publicLandingAssets';

// The browser chooses the layout before hydration. A JS hydration breakpoint
// used to paint the mobile stack first, then move most of the desktop page.
const css = `
.kivelli-landing{height:100svh;min-height:440px;width:100%;display:flex;flex-direction:column;overflow:hidden;background:#05040a;color:#fff9f4}
.kivelli-landing *{box-sizing:border-box}
.kivelli-landing-visual{position:relative;flex-shrink:0;height:max(120px,min(54svh,calc(100svh - 362px - max(0px,env(safe-area-inset-bottom) - 6px))));overflow:hidden;background:#110d13}
.kivelli-landing-visual>img{width:100%;height:100%;display:block;object-fit:cover;object-position:top}
.kivelli-landing-shade{position:absolute;inset:0;background:rgba(6,3,7,.08)}
.kivelli-landing-fade{position:absolute;left:0;right:0;bottom:0;height:118px;background:linear-gradient(180deg,rgba(5,4,10,0),#05040a)}
.kivelli-landing-content{position:relative;display:flex;flex:1;min-height:0;flex-direction:column;align-items:center;margin-top:-2px;padding:10px 24px max(24px,calc(env(safe-area-inset-bottom) + 18px));background:#05040a}
.kivelli-landing-title{width:100%;max-width:490px;margin:0;color:#fff9f4;font-family:Georgia,serif;font-weight:500;letter-spacing:-1.4px;text-align:center;font-size:46px;line-height:48px}
.kivelli-landing-actions{display:flex;flex-direction:column;width:100%;max-width:420px;gap:10px;margin-top:22px}
.kivelli-landing-action{min-height:52px;border:1px solid rgba(188,117,211,.52);border-radius:13px;background:rgba(255,255,255,.015);color:#f8f4f8;font:800 17px/22px system-ui,sans-serif;cursor:pointer}
.kivelli-landing-action:first-child{border-color:rgba(201,91,220,.82);background:rgba(166,37,189,.1);color:#fff}
.kivelli-landing-action:active{opacity:.82;transform:scale(.992)}
.kivelli-landing-action:focus-visible{outline:2px solid #fff;outline-offset:3px}
.kivelli-landing-logo{margin-top:auto;transform:scale(.85);transform-origin:bottom center}
@media(max-width:379px){.kivelli-landing-title{font-size:42px;line-height:44px;letter-spacing:-1.1px}}
@media(max-width:899px) and (max-height:699px){
 .kivelli-landing-visual{height:max(120px,min(54svh,calc(100svh - 312px - max(0px,env(safe-area-inset-bottom) - 6px))))}
 .kivelli-landing-content{padding-top:6px;padding-bottom:max(16px,calc(env(safe-area-inset-bottom) + 10px))}
 .kivelli-landing-title{font-size:40px;line-height:42px}
 .kivelli-landing-actions{gap:8px;margin-top:16px}
 .kivelli-landing-logo{transform:scale(.7)}
}
@media(min-width:900px){
 .kivelli-landing{flex-direction:row}
 .kivelli-landing-visual{width:58%;height:100%}
 .kivelli-landing-visual>img{object-position:center}
 .kivelli-landing-fade{left:auto;top:0;bottom:0;width:90px;height:auto;background:linear-gradient(90deg,rgba(5,4,10,0),#05040a)}
 .kivelli-landing-content{min-width:390px;justify-content:center;margin-top:0;padding:42px 6%}
 .kivelli-landing-title{max-width:440px;text-align:left;font-size:56px;line-height:58px}
 .kivelli-landing-logo{position:absolute;bottom:36px;transform:none}
}
`;

export function PublicLandingPage() {
  return <>
    <Head><style>{css}</style></Head>
    <main className="kivelli-landing">
      <div className="kivelli-landing-visual">
        <img src={publicLandingPrimaryHeroUri} alt="Evelyn Harrow in her Vespormoor study" fetchPriority="high" loading="eager" />
        <div className="kivelli-landing-shade" />
        <div className="kivelli-landing-fade" />
      </div>
      <div className="kivelli-landing-content">
        <h1 className="kivelli-landing-title">{PUBLIC_LANDING_COPY.title}</h1>
        <div className="kivelli-landing-actions">
          <button className="kivelli-landing-action" onClick={() => router.push(joinPathFor() as never)}>Get started</button>
          <button className="kivelli-landing-action" onClick={() => router.push('/auth?mode=signin')}>Sign in</button>
        </div>
        <div className="kivelli-landing-logo"><KivelleLogo height={40} /></div>
      </div>
    </main>
  </>;
}
