import {readFileSync} from 'node:fs';
export const caldersArtDirection=JSON.parse(readFileSync(new URL('../../content/calders-run/art-direction.json',import.meta.url),'utf8'));
export function caldersHomeVisualPrompt(pack,home){
  const local=home.imagePrompt.replace(pack.world.visualContext.hero,'').replace(/\s+/g,' ').trim();
  return `${local} Focus inward on this private home. Window views show nearby walls, a courtyard, foliage or sky. The railway bridge is outside the frame.`;
}
const allowed=new Set(caldersArtDirection.bridgeAllowedAssets);
export function caldersLocationVisualContext(pack,location){
  const bridgeAllowed=allowed.has(`location:${location.slug}`);
  const localPrompt=location.imagePrompt.replace(pack.world.visualContext.hero,'').replace(/\s+/g,' ').trim();
  return {
    canonicalPrompt:`${localPrompt} ${bridgeAllowed?'A railway bridge may be visible here; its central span remains unfinished.':'Compose around this location’s own architecture, furnishings and landscape. Keep the railway bridge outside the frame; windows show nearby buildings, vegetation or sky.'}`,
    visualAnchors:location.visualAnchors??location.sensory??[],
    avoid:['modern objects','readable private papers',...(bridgeAllowed?['completed railway bridge']:['railway bridge in background','repeated town panorama'])],
    railwayBridgeVisible:bridgeAllowed
  };
}
