import AsyncStorage from '@react-native-async-storage/async-storage';
import { VIDEO_CONSUMER_TIERS, VIDEO_CATALOG_VERSION, consumerVideoCreditQuotes } from '@together/domain/src/video-consumer';
import type { VideoGenerationOptions, VideoRouteOption } from '../types';
import { normalizeVideoRouteOption } from './videoGeneration';

const key = `kivelli:video-catalog:${VIDEO_CATALOG_VERSION}`;
let routes: VideoRouteOption[] = VIDEO_CONSUMER_TIERS.map(tier => normalizeVideoRouteOption({ id:tier.id,displayName:tier.name,description:tier.description,badge:tier.tier === 'standard'?'Recommended':'Premium',badges:[],contentClass:'sfw',contentLabel:'Automatic',modelFamily:tier.tier,allowedDurations:tier.durations,durationSeconds:5,supportedResolutions:tier.resolutions,resolution:tier.resolution,audioMode:tier.audioMode,creditQuotes:consumerVideoCreditQuotes(tier.id),providerCostQuotes:{},uiGroup:'recommended',futureConsumerTier:tier.tier,sourceModes:['generated_first_frame','existing_photo'] })!).filter(Boolean);
void AsyncStorage.getItem(key).then(value => { if (!value) return; const cached = (JSON.parse(value) as unknown[]).map(normalizeVideoRouteOption).filter((r):r is VideoRouteOption => !!r); if (cached.length === 2 && cached.every(r => r.id === 'tier:standard' || r.id === 'tier:premium')) routes = cached; }).catch(() => undefined);
export function cachedVideoOptions(): VideoGenerationOptions { return { available:false,selectorMode:'all',rawModelNamesExposed:false,sourceAspectRatio:'9:16',defaultRouteId:'tier:standard',routes,motionPresets:[],creditBalance:null,activeVideo:false,activeVideoId:null,activeVideoStatus:null,latestVideoId:null,latestVideoStatus:null }; }
export function rememberVideoCatalog(options: VideoGenerationOptions): VideoGenerationOptions {
  if (options.routes.length === 2 && options.routes.every(r => r.id === 'tier:standard' || r.id === 'tier:premium')) { routes = options.routes; void AsyncStorage.setItem(key,JSON.stringify(routes)).catch(() => undefined); }
  return options;
}
