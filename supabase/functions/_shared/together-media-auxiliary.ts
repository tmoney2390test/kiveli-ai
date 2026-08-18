import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { resolvePlaceContext } from './together-place.ts';
import { refundCredits, resolveSubscriptionState } from './kivelle-subscription.ts';
import { track } from './together.ts';
import { routeCanonicalMedia, type CanonicalMediaRequest, type ProviderCompletedMedia } from './together-media-providers.ts';
import { configuredWaveSpeedClient, envBoolean } from './wavespeed.ts';
import { failProviderMedia, finalizeCreatorProviderJob, finalizeLoraProviderJob } from './together-media-finalizer.ts';

export async function dispatchCreatorAppearanceJobs(db: SupabaseClient, limit: number): Promise<{ claimed: number; submitted: number; ready: number; failed: number }> {
  const result = { claimed: 0, submitted: 0, ready: 0, failed: 0 };
  if (!envBoolean('KIVELLE_WAVESPEED_CREATOR_ENABLED') || !configuredWaveSpeedClient()) return result;
  const claimed = await db.rpc('kivelle_claim_creator_media_jobs', { p_limit: Math.min(limit, 3) });
  if (claimed.error) throw new AppError('INTERNAL_ERROR', 'Creator media jobs could not be claimed.', 500, true);
  result.claimed = (claimed.data ?? []).length;
  for (const asset of claimed.data ?? []) {
    let providerJob: Record<string, unknown> | null = null;
    try {
      const draftResult = await db.from('together_creator_drafts').select('*').eq('id', String(asset.draft_id)).eq('user_id', String(asset.user_id)).maybeSingle();
      const draft = draftResult.data;
      if (!draft) throw new AppError('NOT_FOUND', 'That Creator draft is unavailable.', 404);
      const locationId = selectedMeetingLocation(draft) ?? String(draft.life_config?.homeLocationId ?? '');
      if (!locationId) throw new AppError('CONFLICT', 'Choose a canonical home or meeting place before generating an appearance.', 409);
      const place = await resolvePlaceContext({ db, locationId, userId: String(asset.user_id) });
      const identity = (draft.identity_config ?? {}) as Record<string, unknown>;
      const request: CanonicalMediaRequest = {
        mediaId: String(asset.id),
        mediaType: 'image',
        companion: { templateId: String(draft.id), versionId: String(draft.id), name: String(identity.name ?? 'Companion'), age: Number(identity.age ?? 18) },
        visualIdentity: { canonicalDescription: String(asset.description), age: Number(identity.age ?? 18), referenceStoragePaths: [], identifyingFeatures: [], fashionStyle: String(asset.label), visualDoNotChange: stringArray((asset.metadata as Record<string, unknown> | null)?.visualDoNotChange) },
        referenceImages: [],
        context: { place, activity: 'a neutral canonical identity portrait', mood: 'natural, self-possessed, approachable', timeOfDay: place.clock.daypart },
        composition: { shotType: 'portrait', framing: 'waist-up portrait, face clearly visible, natural posture, uncluttered background', aspectRatio: '4:5' },
        contentLevel: 'standard',
        qualityTier: 'standard',
      };
      const subscription = await resolveSubscriptionState(db, String(asset.user_id));
      const routed = routeCanonicalMedia(request, { source: 'creator', userTier: subscription.tier, preferredProvider: 'wavespeed' });
      const requestId = `creator:${asset.id}`;
      const created = await db.from('together_media_provider_jobs').insert({
        user_id: asset.user_id,
        continuity_id: draft.target_continuity_id,
        creator_asset_id: asset.id,
        job_type: 'image',
        provider: routed.provider.id,
        model: routed.route.capability.model,
        route_id: routed.route.capability.id,
        request_id: requestId,
        status: 'submitting',
        attempt_count: 1,
        provider_metadata: { routingReason: routed.route.reasonCode, source: 'creator', fallbackRouteIds: routed.route.fallbacks.map((entry) => entry.id) },
      }).select('*').single();
      if (created.error || !created.data) {
        const existing = await db.from('together_media_provider_jobs').select('*').eq('provider', routed.provider.id).eq('request_id', requestId).maybeSingle();
        if (existing.data?.finalized_at) { result.ready += 1; continue; }
        if (existing.data?.provider_request_id && existing.data.status === 'processing') { result.submitted += 1; continue; }
        throw new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'The provider did not confirm the Creator request. No duplicate request was sent.', 503, false);
      }
      providerJob = created.data;
      const submission = await routed.provider.submit(request, routed.route.capability);
      const now = new Date().toISOString();
      await db.from('together_media_provider_jobs').update({ provider_request_id: submission.providerRequestId, status: 'processing', submitted_at: now, next_poll_at: new Date(Date.now() + 45_000).toISOString(), updated_at: now }).eq('id', created.data.id).eq('status', 'submitting');
      await db.from('together_creator_assets').update({ provider: routed.provider.id, model: submission.model, metadata: { ...((asset.metadata ?? {}) as Record<string, unknown>), providerJobId: created.data.id, providerRouteId: routed.route.capability.id }, updated_at: now }).eq('id', asset.id).eq('status', 'generating');
      if (submission.status === 'completed' && submission.result) { await finalizeCreatorProviderJob(db, { jobId: String(created.data.id), result: submission.result }); result.ready += 1; }
      else result.submitted += 1;
    } catch (error) {
      result.failed += 1;
      if (providerJob?.id) await failProviderMedia(db, { jobId: String(providerJob.id), failureCode: error instanceof AppError ? error.code : 'provider_failure', failureReasonSafe: error instanceof AppError ? error.message : 'The Creator appearance could not be created.' });
      else await failUntrackedCreatorAsset(db, asset, error instanceof AppError ? error.code : 'provider_failure');
    }
  }
  return result;
}

export async function dispatchLoraTrainingJobs(db: SupabaseClient, limit: number): Promise<{ claimed: number; submitted: number; ready: number; failed: number }> {
  const result = { claimed: 0, submitted: 0, ready: 0, failed: 0 };
  const client = configuredWaveSpeedClient();
  if (!client || !envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')) return result;
  const claimed = await db.rpc('kivelle_claim_media_profile_training', { p_limit: Math.min(limit, 2) });
  if (claimed.error) throw new AppError('INTERNAL_ERROR', 'Character training jobs could not be claimed.', 500, true);
  result.claimed = (claimed.data ?? []).length;
  for (const profile of claimed.data ?? []) {
    let providerJob: Record<string, unknown> | null = null;
    try {
      const metadata = (profile.metadata ?? {}) as Record<string, unknown>;
      const bucket = String(metadata.trainingArchiveBucket ?? 'kivelle-model-assets');
      const path = String(metadata.trainingArchivePath ?? '');
      if (!path || stringArray(profile.source_reference_asset_ids).length < 10) throw new AppError('VALIDATION_ERROR', 'A varied 10–20 image training set is required.', 422);
      const signed = await db.storage.from(bucket).createSignedUrl(path, 3600);
      if (!signed.data?.signedUrl) throw new AppError('INTERNAL_ERROR', 'The character training set could not be prepared.', 500, true);
      const owner = await characterVersionOwner(db, String(profile.character_version_id));
      const model = Deno.env.get('WAVESPEED_MODEL_ZIMAGE_TRAINER') ?? Deno.env.get('WAVESPEED_MODEL_LORA_TRAINER') ?? 'wavespeed-ai/z-image/base-lora-trainer';
      const requestId = `lora:${profile.id}:revision:${profile.source_revision}`;
      const created = await db.from('together_media_provider_jobs').insert({ user_id: owner.userId, character_media_profile_id: profile.id, job_type: 'lora', provider: 'wavespeed', model, route_id: 'wavespeed-zimage-trainer', request_id: requestId, status: 'submitting', attempt_count: 1, provider_metadata: { sourceRevision: profile.source_revision, referenceCount: stringArray(profile.source_reference_asset_ids).length } }).select('*').single();
      if (created.error || !created.data) {
        const existing = await db.from('together_media_provider_jobs').select('*').eq('provider', 'wavespeed').eq('request_id', requestId).maybeSingle();
        if (existing.data?.finalized_at) { result.ready += 1; continue; }
        if (existing.data?.provider_request_id && existing.data.status === 'processing') { result.submitted += 1; continue; }
        throw new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'The provider did not confirm character training. No duplicate request was sent.', 503, false);
      }
      providerJob = created.data;
      const params = (profile.training_params ?? {}) as Record<string, unknown>;
      const submission = await client.submit(model, { data: signed.data.signedUrl, trigger_word: String(profile.trigger_word ?? 'KIVELLE_PERSON'), steps: boundedNumber(params.steps, 1200, 500, 3000), learning_rate: boundedNumber(params.learningRate, 0.0002, 0.00001, 0.005), lora_rank: boundedNumber(params.loraRank, 32, 8, 128) });
      const now = new Date().toISOString();
      await db.from('together_media_provider_jobs').update({ provider_request_id: submission.providerRequestId, status: 'processing', submitted_at: now, next_poll_at: new Date(Date.now() + 120_000).toISOString(), updated_at: now }).eq('id', created.data.id).eq('status', 'submitting');
      await db.from('together_character_media_profiles').update({ status: 'training', provider_training_id: submission.providerRequestId, updated_at: now }).eq('id', profile.id).eq('status', 'preparing');
      if (owner.userId) await track(db, owner.userId, 'character_lora_training_started', { characterMediaProfileId: profile.id, characterVersionId: profile.character_version_id, provider: 'wavespeed', model, sourceRevision: profile.source_revision });
      if (submission.status === 'completed' && submission.result?.outputs[0]) { await finalizeLoraProviderJob(db, { jobId: String(created.data.id), result: { outputUrl: submission.result.outputs[0], providerRequestId: submission.providerRequestId, model: submission.model, generationMs: submission.result.inferenceMs } }); result.ready += 1; }
      else result.submitted += 1;
    } catch (error) {
      result.failed += 1;
      if (providerJob?.id) await failProviderMedia(db, { jobId: String(providerJob.id), failureCode: error instanceof AppError ? error.code : 'provider_training_failed', failureReasonSafe: error instanceof AppError ? error.message : 'The character identity training could not be completed.' });
      else await db.from('together_character_media_profiles').update({ status: 'failed', failure_code: error instanceof AppError ? error.code : 'provider_training_failed', failure_reason_safe: error instanceof AppError ? error.message : 'The character identity training could not be completed.', updated_at: new Date().toISOString() }).eq('id', profile.id).eq('status', 'preparing');
    }
  }
  return result;
}

export async function finalizeAuxiliaryProviderJob(db: SupabaseClient, job: Record<string, unknown>, result: ProviderCompletedMedia, providerStatus?: Record<string, unknown>) {
  if (job.character_media_profile_id) return finalizeLoraProviderJob(db, { jobId: String(job.id), result, providerStatus });
  if (job.creator_asset_id) return finalizeCreatorProviderJob(db, { jobId: String(job.id), result, providerStatus });
  return null;
}

function selectedMeetingLocation(draft: Record<string, unknown>): string | null {
  const config = (draft.first_meeting_config ?? {}) as Record<string, unknown>;
  const selectedId = String(config.selectedId ?? '');
  const option = Array.isArray(config.options) ? config.options.find((item) => String((item as Record<string, unknown>).id) === selectedId) as Record<string, unknown> | undefined : undefined;
  return option?.locationId ? String(option.locationId) : null;
}

async function characterVersionOwner(db: SupabaseClient, characterVersionId: string): Promise<{ userId: string | null }> {
  const result = await db.from('together_character_versions').select('character_template_id,together_character_templates(creator_id)').eq('id', characterVersionId).maybeSingle();
  const template = result.data?.together_character_templates as unknown as Record<string, unknown> | null;
  return { userId: template?.creator_id ? String(template.creator_id) : null };
}

function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function boundedNumber(value: unknown, fallback: number, min: number, max: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }

async function failUntrackedCreatorAsset(db: SupabaseClient, asset: Record<string, unknown>, failureCode: string) {
  await db.from('together_creator_assets').update({ status: 'failed', metadata: { ...((asset.metadata ?? {}) as Record<string, unknown>), failureCode }, updated_at: new Date().toISOString() }).eq('id', String(asset.id)).eq('status', 'generating');
  const group = await db.from('together_creator_assets').select('status,metadata').eq('draft_id', String(asset.draft_id)).eq('group_request_id', String(asset.group_request_id));
  const rows = group.data ?? [];
  if (!rows.length || !rows.every((item) => ['ready', 'failed', 'archived'].includes(String(item.status))) || rows.some((item) => item.status === 'ready')) return;
  const transactionId = String(((asset.metadata ?? {}) as Record<string, unknown>).creditTransactionId ?? '');
  if (transactionId) await refundCredits(db, { userId: String(asset.user_id), transactionId, idempotencyKey: `refund:${transactionId}`, metadata: { reason: 'creator_draft_appearance_failed', creatorDraftId: asset.draft_id } });
}
