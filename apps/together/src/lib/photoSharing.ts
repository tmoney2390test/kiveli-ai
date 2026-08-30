export type PhotoSharingTapResult='picker'|'paywall';

export function handlePhotoSharingTap(entitled:boolean,actions:{openPicker:()=>void;openPaywall:()=>void}):PhotoSharingTapResult{
  if(entitled){actions.openPicker();return'picker';}
  actions.openPaywall();return'paywall';
}
