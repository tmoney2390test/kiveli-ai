import type { VoiceCallRoute } from './types';

type RouteAvailability={route:VoiceCallRoute;available:boolean};

/**
 * The call picker has exactly two product routes. Render this shell immediately
 * while the server hydrates account availability and the current balance.
 */
export const voiceRouteShellOptions=[
  {route:'standard' as const,displayName:'Essential',creditsPerMinute:3},
  {route:'express' as const,displayName:'Immersive',creditsPerMinute:8},
] as const;

export function resolvePreferredVoiceRoute(
  options:RouteAvailability[],
  stored:unknown,
):VoiceCallRoute{
  const requested=stored==='standard'||stored==='express'?stored:null;
  return (requested?options.find((option)=>option.route===requested&&option.available)?.route:undefined)
    ??options.find((option)=>option.route==='standard'&&option.available)?.route
    ??options.find((option)=>option.available)?.route
    ??'standard';
}
