import type { SupabaseClient } from '@supabase/supabase-js';
import { consumerVideoCreditQuotes } from '../../../packages/together-domain/src/video-consumer.ts';
import { configuredVideoRouteCatalog, type SafeVideoRouteOption, type VideoRouteDefinition, type VideoSettings } from './kivelle-video-routes.ts';
import { configuredWaveSpeedClient, type WaveSpeedQuote } from './wavespeed.ts';
import { AppError } from './types.ts';

export async function videoPricePublication(db: SupabaseClient) {
  const { data, error } = await db.from('together_video_price_publications').select('id,credits_per_unit,minimum_credits,published_at,reason').order('id', { ascending: false }).limit(1).single();
  if (error || !data) throw new AppError('PROVIDER_UNAVAILABLE', 'Video prices could not be checked. Please try again.', 503, true);
  return data;
}
export async function publishedVideoRoutes(db: SupabaseClient, routes: SafeVideoRouteOption[]) {
  const publication = await videoPricePublication(db);
  return routes.map(route => ({ ...route, creditQuotes: consumerVideoCreditQuotes(route.id, Number(publication.credits_per_unit), Number(publication.minimum_credits)) }));
}
export async function publishedVideoCreditCost(db: SupabaseClient, route: VideoRouteDefinition, settings: VideoSettings, expected?: number) {
  const publication = await videoPricePublication(db);
  const quotes = consumerVideoCreditQuotes(route.modelFamily === 'minimax-h3' ? 'tier:premium' : 'tier:standard', Number(publication.credits_per_unit), Number(publication.minimum_credits));
  const cost = quotes[`${settings.resolution}:${settings.duration}:${settings.sound ? 'sound' : 'silent'}`];
  if (!Number.isFinite(cost)) throw new AppError('VALIDATION_ERROR', 'Choose supported video settings.', 422);
  if ((expected === undefined && Number(publication.id) !== 1) || (expected !== undefined && expected !== cost)) throw new AppError('CONFLICT', 'Video prices have updated. Reopen video settings to review the current price. You have not been charged.', 409, true);
  return cost;
}
export function newVideoSettings(route: VideoRouteDefinition, settings: VideoSettings): VideoSettings {
  return { ...settings, sound: route.modelFamily === 'minimax-h3' ? true : settings.sound };
}
export async function recordVideoPrice(db: SupabaseClient, routeId: string, settings: Pick<VideoSettings,'resolution'|'duration'|'sound'>, quote: WaveSpeedQuote, source: 'request'|'monitor') {
  try {
  const { error } = await db.from('together_video_price_observations').insert({ route_id: routeId, settings_key: `${settings.resolution}:${settings.duration}:${settings.sound ? 'sound' : 'silent'}`, list_price_usd: quote.listPriceUsd ?? quote.amountUsd, payable_price_usd: quote.amountUsd, discount_rate: quote.discountRate ?? null, source });
  if (error) console.warn(JSON.stringify({ operation: 'video_price_observation', code: error.code }));
  } catch { console.warn('video_price_observation_unavailable'); }
}
export async function monitorVideoPrices(db: SupabaseClient) {
  const { data: runId, error } = await db.rpc('kivelle_claim_video_price_monitor');
  if (error) throw new AppError('INTERNAL_ERROR', 'Price monitoring could not start.', 500, true);
  if (!runId) return { busy: true };
  const client = configuredWaveSpeedClient();
  if (!client) { await db.from('together_video_price_runs').update({ completed_at: new Date().toISOString(), failed: 1 }).eq('id', runId); return { unavailable: true }; }
  const work = configuredVideoRouteCatalog().filter(r => r.selectable).flatMap(route => route.supportedResolutions.flatMap(resolution => route.allowedDurations.flatMap(duration => (route.audioMode === 'toggleable' ? [false, true] : [true]).map(sound => ({ route, resolution, duration, sound })))));
  let checked = 0, failed = 0;
  await Promise.all([0, 1].map(async () => {
    while (work.length) {
      const item = work.shift()!;
      try {
        const payload = { resolution: item.resolution, duration: item.duration, ...(item.route.audioMode === 'toggleable' ? { generate_audio: item.sound } : {}), aspect_ratio: '9:16' };
        let quote: WaveSpeedQuote | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { quote = await client.quote(item.route.model, payload); break; }
          catch (cause) { if (attempt || !(cause instanceof AppError && cause.retryable)) throw cause; await new Promise(resolve => setTimeout(resolve, 500)); }
        }
        await recordVideoPrice(db, item.route.id, item, quote!, 'monitor'); checked++;
      } catch (cause) {
        failed++;
        await db.from('together_video_price_observations').insert({ route_id: item.route.id, settings_key: `${item.resolution}:${item.duration}:${item.sound ? 'sound' : 'silent'}`, source: 'monitor', error_code: cause instanceof AppError ? cause.code : 'QUOTE_FAILED' });
      }
    }
  }));
  await db.from('together_video_price_runs').update({ completed_at: new Date().toISOString(), checked, failed }).eq('id', runId);
  return { checked, failed };
}
export async function videoCostsDashboard(db: SupabaseClient) {
  const [history, runs, summary, publication] = await Promise.all([
    db.from('together_video_price_observations').select('*').gte('observed_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('observed_at', { ascending: false }).limit(5000),
    db.from('together_video_price_runs').select('*').order('started_at', { ascending: false }).limit(20),
    db.rpc('kivelle_video_cost_summary'), videoPricePublication(db),
  ]);
  if (history.error || runs.error || summary.error) throw new AppError('INTERNAL_ERROR', 'Video costs could not be loaded.', 500, true);
  return { history: history.data, runs: runs.data, summary: summary.data, publication, routes: configuredVideoRouteCatalog().filter(r => r.selectable).map(r => ({ id: r.id, model: r.model, name: r.modelFamily === 'minimax-h3' ? 'Cinematic' : 'Standard', contentClass: r.contentClass })) };
}
