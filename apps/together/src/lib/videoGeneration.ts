import type { VideoDurationSeconds, VideoGenerationOptions, VideoRouteOption } from '../types';

export function videoWaitLabel(route:VideoRouteOption):string{
  const wait=route.estimatedWaitSeconds;
  return wait.median>=120?`About ${Math.round(wait.median/60)}–${Math.ceil(wait.max/60)} min`:`About ${wait.min}–${wait.max} sec`;
}

export function videoCreditCost(route:VideoRouteOption,durationSeconds:VideoDurationSeconds):number{
  return Math.max(1,Math.round(route.creditCostPerSecond*durationSeconds));
}

export function videoOutputLabel(route:VideoRouteOption,aspectRatio:VideoGenerationOptions['sourceAspectRatio'],durationSeconds:VideoDurationSeconds=route.durationSeconds):string{
  const resolution=route.resolution==='provider_native'?'provider-native resolution':route.resolution;
  return `${durationSeconds}-second ${aspectRatio??route.supportedAspectRatios[0]} MP4 · ${resolution} · playback starts muted`;
}

export function canSubmitVideoSelection(input:{route:VideoRouteOption|null;durationSeconds:VideoDurationSeconds;balance:number;loading:boolean;submitting:boolean;hasActiveVideo:boolean}):boolean{
  return Boolean(input.route&&input.route.allowedDurations.includes(input.durationSeconds)&&!input.loading&&!input.submitting&&!input.hasActiveVideo&&input.balance>=videoCreditCost(input.route,input.durationSeconds));
}

export function validVideoFeedback(verdict:'looks_good'|'needs_work',reasonCodes:string[]):boolean{
  return verdict==='looks_good'?reasonCodes.length===0:reasonCodes.length>0;
}
