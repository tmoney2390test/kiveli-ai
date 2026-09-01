import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { webBootstrap } from '../src/lib/webBootstrap';

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
