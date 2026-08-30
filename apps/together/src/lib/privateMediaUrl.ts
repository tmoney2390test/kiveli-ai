/**
 * Routes private Supabase storage playback through Kivelli's same-origin
 * gateway on web. Native apps continue using the provider URL directly.
 */
export function privateMediaPlaybackUrl(value:string|null|undefined,platform:string,configuredUrl:string):string|null{
  if(!value)return null;
  if(platform!=='web')return value;
  try{
    const mediaUrl=new URL(value),configured=new URL(configuredUrl);
    const proxyPrefix=configured.pathname.replace(/\/$/,'');
    if(mediaUrl.origin===configured.origin||!proxyPrefix||proxyPrefix==='/')return value;
    if(!mediaUrl.hostname.endsWith('.supabase.co')||!mediaUrl.pathname.startsWith('/storage/v1/'))return value;
    return`${configured.origin}${proxyPrefix}${mediaUrl.pathname}${mediaUrl.search}`;
  }catch{return value;}
}
