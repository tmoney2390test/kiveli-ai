import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="theme-color" content="#0A0910"/><meta name="description" content="Kivelle.AI — a relationship that keeps living."/><title>Kivelle.AI</title><script dangerouslySetInnerHTML={{__html:"globalThis.__KIVELLE_ENTRY_HREF__=location.pathname+location.search+location.hash;"}}/><ScrollViewStyleReset/><style dangerouslySetInnerHTML={{__html:`html,body,#root{height:100%;background:#0A0910}body{margin:0;overflow:hidden;-webkit-font-smoothing:antialiased}*{box-sizing:border-box}input,textarea,button{font:inherit}button,a,[role=button]{cursor:pointer}`}}/></head><body>{children}</body></html>;
}
