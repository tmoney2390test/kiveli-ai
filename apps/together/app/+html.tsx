import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="theme-color" content="#080B13"/><meta name="description" content="Together — persistent AI characters, memories, relationships, and a living shared world."/><title>Together</title><ScrollViewStyleReset/><style dangerouslySetInnerHTML={{__html:`html,body,#root{height:100%;background:#080B13}body{margin:0;overflow:hidden;-webkit-font-smoothing:antialiased}*{box-sizing:border-box}input,textarea,button{font:inherit}button,a,[role=button]{cursor:pointer}`}}/></head><body>{children}</body></html>;
}
