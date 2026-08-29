import type { VideoGenerationOptions, VideoRouteOption } from '../types';

export function videoWaitLabel(route:VideoRouteOption):string{
  const wait=route.estimatedWaitSeconds;
  return wait.median>=120?`About ${Math.round(wait.median/60)}–${Math.ceil(wait.max/60)} min`:`About ${wait.min}–${wait.max} sec`;
}

export function videoOutputLabel(route:VideoRouteOption,aspectRatio:VideoGenerationOptions['sourceAspectRatio']):string{
  const resolution=route.resolution==='provider_native'?'provider-native resolution':route.resolution;
  return `${route.durationSeconds}-second ${aspectRatio??route.supportedAspectRatios[0]} MP4 · ${resolution} · playback starts muted`;
}

export function canSubmitVideoSelection(input:{route:VideoRouteOption|null;balance:number;loading:boolean;submitting:boolean;hasActiveVideo:boolean}):boolean{
  return Boolean(input.route&&!input.loading&&!input.submitting&&!input.hasActiveVideo&&input.balance>=input.route.creditCost);
}

export function validVideoFeedback(verdict:'looks_good'|'needs_work',reasonCodes:string[]):boolean{
  return verdict==='looks_good'?reasonCodes.length===0:reasonCodes.length>0;
}
