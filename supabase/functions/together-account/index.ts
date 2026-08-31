import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { strToU8, zipSync } from 'npm:fflate@0.8.2';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';
import { reconcilePersonaIdentity } from '../_shared/kivelle-persona.ts';
import { ensureMainContinuity } from '../_shared/together-continuity.ts';
import { resolveSubscriptionAccess } from '../_shared/kivelle-subscription.ts';
import { cancelStripeSubscriptionNow } from '../_shared/stripe.ts';
import { accountDeletionBillingPlan, hasRecentAccountAuthentication, isOwnedAvatarPath } from '../_shared/kivelle-account-lifecycle.ts';

const goals = z.enum(['Dating', 'Friendship', 'Stories', 'Social worlds']);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), displayName: z.string().trim().min(1).max(50), aboutMe: z.string().trim().max(280), interests: z.array(z.string().trim().min(1).max(40)).max(10), goals: z.array(goals).max(4), avatarPath: z.string().max(500).nullable(), syncMainPersona: z.boolean().default(true) }),
  z.object({ action: z.literal('privacy'), settings: z.record(z.string(), z.boolean()) }),
  z.object({ action: z.literal('content'), romanceEnabled: z.boolean() }),
  z.object({ action: z.literal('conversation_style'), responseStyle: z.enum(['texting','paragraph']) }),
  z.object({ action: z.literal('export_request') }),
  z.object({ action: z.literal('export_status'), exportId: z.string().uuid() }),
  z.object({ action: z.literal('delete_preview') }),
  z.object({ action: z.literal('delete'), confirmation: z.literal('DELETE') }),
]);

const exportTables = ['together_profiles','together_user_personas','together_continuities','together_character_instances','together_relationship_states','together_relationship_milestones','together_conversations','together_messages','together_conversation_attachments','together_memories','together_open_threads','together_life_events','together_shared_plans','together_plan_participant_responses','together_date_sessions','together_date_choices','together_moments','together_story_arc_instances','together_knowledge_transfers','together_generated_media','together_voice_call_sessions','together_scene_sessions','together_scene_participants','together_scene_messages','together_content_usage','together_notification_preferences','together_entitlements'] as const;
const exportLifetimeMs = 24 * 60 * 60_000;

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const actionLimit = input.action === 'export_request' ? 4 : input.action === 'export_status' ? 120 : input.action === 'delete' ? 3 : 20;
  await enforceRateLimit(db, user.id, `together_account_${input.action}`, actionLimit, 3600);

  if (input.action === 'profile') {
    if (!isOwnedAvatarPath(input.avatarPath, user.id)) throw new AppError('VALIDATION_FAILED', 'That account photo does not belong to this account.', 400);
    const { data: before, error: beforeError } = await db.from('together_profiles').select('avatar_path').eq('user_id', user.id).single();
    if (beforeError || !before) throw new AppError('INTERNAL_ERROR', 'Could not load your profile.', 500, true);
    const now = new Date().toISOString();
    const { data, error } = await db.from('together_profiles').update({ display_name: input.displayName, about_me: input.aboutMe, interests: input.interests, experience_goals: input.goals, avatar_path: input.avatarPath, updated_at: now }).eq('user_id', user.id).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save your profile.', 500, true);
    let mainPersona = null;
    if (input.syncMainPersona) {
      await ensureMainContinuity(db, user.id);
      const { data: personaBefore } = await db.from('together_user_personas').select('*').eq('user_id', user.id).eq('is_default', true).maybeSingle();
      if (personaBefore) {
        const appearance = { ...record(personaBefore.appearance_config) };
        if (input.avatarPath) appearance.avatarPath = input.avatarPath; else delete appearance.avatarPath;
        const metadata = { ...record(personaBefore.metadata), experienceGoals: input.goals, accountProfileSyncedAt: now };
        const updated = await db.from('together_user_personas').update({ name: input.displayName, display_name: input.displayName, biography: input.aboutMe || null, interests: input.interests, appearance_config: appearance, metadata, updated_at: now }).eq('id', personaBefore.id).eq('user_id', user.id).select('*').single();
        if (updated.error || !updated.data) throw new AppError('INTERNAL_ERROR', 'Your account was saved, but Main Persona could not be synchronized.', 500, true);
        await reconcilePersonaIdentity({ db, userId: user.id, personaId: String(personaBefore.id), before: personaBefore, after: updated.data });
        mainPersona = updated.data;
      }
    }
    if (before.avatar_path && before.avatar_path !== input.avatarPath) waitUntil(removeAvatarWhenUnreferenced(db, user.id, String(before.avatar_path)));
    await track(db, user.id, 'account_profile_updated', { main_persona_synced: input.syncMainPersona, avatar_changed: before.avatar_path !== input.avatarPath });
    return json({ data: { profile: data, mainPersona }, correlationId }, 200, correlationId);
  }

  if (input.action === 'privacy') {
    const { data, error } = await db.from('together_profiles').update({ privacy_settings: input.settings, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('privacy_settings').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save privacy settings.', 500, true);
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'content') {
    const { data: profile } = await db.from('together_profiles').select('content_preferences').eq('user_id', user.id).single();
    const preferences = { ...record(profile?.content_preferences), romanceEnabled: input.romanceEnabled };
    const { data, error } = await db.from('together_profiles').update({ content_preferences: preferences, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('content_preferences').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save content preferences.', 500, true);
    await track(db, user.id, 'content_preferences_updated', { romance_enabled: input.romanceEnabled });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'conversation_style') {
    const { data: profile } = await db.from('together_profiles').select('conversation_preferences').eq('user_id', user.id).single();
    const current = record(profile?.conversation_preferences), previousStyle = current.responseStyle === 'paragraph' ? 'paragraph' : 'texting';
    const conversationPreferences = { ...current, responseStyle: input.responseStyle };
    const { data, error } = await db.from('together_profiles').update({ conversation_preferences: conversationPreferences, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('conversation_preferences').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save conversation style.', 500, true);
    await track(db, user.id, 'conversation_style_changed', { previousStyle, responseStyle: input.responseStyle });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'export_request') {
    await expireAccountExports(db, user.id);
    const { data: existing } = await db.from('together_account_exports').select('id,status,file_name,expires_at').eq('user_id', user.id).in('status', ['queued','processing','ready']).gt('expires_at', new Date().toISOString()).order('requested_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) return json({ data: { id: existing.id, status: existing.status, fileName: existing.file_name, expiresAt: existing.expires_at }, correlationId }, 200, correlationId);
    const id = crypto.randomUUID(), expiresAt = new Date(Date.now() + exportLifetimeMs).toISOString(), fileName = `kivelle-data-${new Date().toISOString().slice(0, 10)}.zip`;
    const { error } = await db.from('together_account_exports').insert({ id, user_id: user.id, status: 'queued', file_name: fileName, expires_at: expiresAt });
    if (error) throw new AppError('INTERNAL_ERROR', 'Your data export could not be queued.', 500, true);
    waitUntil(prepareAccountExport(db, { id, userId: user.id, email: user.email ?? null }));
    return json({ data: { id, status: 'queued', fileName, expiresAt }, correlationId }, 202, correlationId);
  }

  if (input.action === 'export_status') {
    const { data: item, error } = await db.from('together_account_exports').select('id,status,file_name,storage_bucket,storage_path,expires_at,size_bytes,record_count,failure_code').eq('id', input.exportId).eq('user_id', user.id).maybeSingle();
    if (error || !item) throw new AppError('NOT_FOUND', 'That data export was not found.', 404);
    if (item.status === 'ready' && new Date(item.expires_at).getTime() <= Date.now()) {
      if (item.storage_path) await queueStorageCleanup(db, user.id, String(item.storage_bucket), String(item.storage_path));
      await db.from('together_account_exports').update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() }).eq('id', item.id).eq('user_id', user.id);
      return json({ data: { id: item.id, status: 'expired', fileName: item.file_name, expiresAt: item.expires_at }, correlationId }, 200, correlationId);
    }
    let signedUrl: string | undefined;
    if (item.status === 'ready' && item.storage_path) {
      const signed = await db.storage.from(String(item.storage_bucket)).createSignedUrl(String(item.storage_path), 300, { download: String(item.file_name) });
      if (signed.error || !signed.data?.signedUrl) throw new AppError('INTERNAL_ERROR', 'Your private download link could not be created.', 500, true);
      signedUrl = signed.data.signedUrl;
      await db.from('together_account_exports').update({ downloaded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id).eq('user_id', user.id);
      await track(db, user.id, 'account_data_export_downloaded');
    }
    return json({ data: { id: item.id, status: item.status, fileName: item.file_name, expiresAt: item.expires_at, sizeBytes: item.size_bytes, recordCount: item.record_count, failureCode: item.failure_code, ...(signedUrl ? { signedUrl } : {}) }, correlationId }, 200, correlationId);
  }

  const access = await resolveSubscriptionAccess(db, user.id);
  const billingPlan = accountDeletionBillingPlan(access.billing);
  if (input.action === 'delete_preview') return json({ data: { canDelete: billingPlan.canDelete, billingAction: billingPlan.action, providerLabel: billingPlan.providerLabel, message: billingPlan.message, requiresRecentAuthentication: true }, correlationId }, 200, correlationId);

  if (!hasRecentAccountAuthentication(user.last_sign_in_at)) throw new AppError('AUTH_REQUIRED', 'For your security, sign in again before deleting your account.', 401);
  if (!billingPlan.canDelete) throw new AppError('CONFLICT', billingPlan.message, 409);
  const storage = await ownedStorageManifest(db, user.id);
  const staged = await stageDeletionCleanup(db, user.id, storage);
  let billingCanceled = false;
  try {
    if (billingPlan.action === 'cancel_stripe') {
      const subscriptionId = access.billing.subscriptionId;
      if (!subscriptionId) throw new AppError('BILLING_REJECTED', 'Your Stripe subscription could not be identified. Open Billing or contact support before deleting the account.', 409);
      await cancelStripeSubscriptionNow(subscriptionId, correlationId);
      billingCanceled = true;
      await db.from('together_billing_subscriptions').update({ status: 'canceled', cancel_at_period_end: false, canceled_at: new Date().toISOString(), access_ends_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('provider', 'stripe').eq('provider_subscription_id', subscriptionId);
    }
  } catch (error) {
    await rollbackStagedDeletionCleanup(db, staged);
    throw error;
  }
  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError) {
    await rollbackStagedDeletionCleanup(db, staged);
    throw new AppError('INTERNAL_ERROR', 'Your account could not be deleted. Please try again.', 500, true);
  }
  const jobIds = [...staged.existingIds, ...staged.createdIds];
  if (jobIds.length) {
    await db.from('together_storage_cleanup_jobs').update({ status: 'pending', updated_at: new Date().toISOString() }).in('id', jobIds);
    waitUntil(processStorageCleanupJobs(db, jobIds));
  }
  const receiptId = crypto.randomUUID(), fingerprint = await accountFingerprint(user.id);
  const receipt = await db.from('together_account_deletion_receipts').insert({ id: receiptId, user_fingerprint: fingerprint, billing_provider: access.billing.provider ?? null, billing_canceled: billingCanceled, storage_object_count: storage.length, correlation_id: correlationId });
  if (receipt.error) console.warn(JSON.stringify({ level: 'warn', operation: 'account_deletion_receipt', correlationId, code: 'receipt_write_failed' }));
  return json({ data: { deleted: true, receiptId }, correlationId }, 200, correlationId);
});

async function prepareAccountExport(db: SupabaseClient, input: { id: string; userId: string; email: string | null }) {
  const path = `${input.userId}/exports/${input.id}.zip`;
  let failureCode = 'EXPORT_QUERY_FAILED';
  try {
    await db.from('together_account_exports').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', input.id).eq('user_id', input.userId);
    const payload = await buildAccountExport(db, input.userId, input.email);
    const zip = zipSync({ 'kivelle-data.json': strToU8(JSON.stringify(payload, null, 2)) }, { level: 6 });
    failureCode = 'EXPORT_STORAGE_FAILED';
    const upload = await db.storage.from('together-user-media').upload(path, zip, { contentType: 'application/zip', cacheControl: '0', upsert: false });
    if (upload.error) throw upload.error;
    failureCode = 'EXPORT_FINALIZATION_FAILED';
    const { error } = await db.from('together_account_exports').update({ status: 'ready', storage_path: path, ready_at: new Date().toISOString(), size_bytes: zip.byteLength, record_count: countExportRecords(payload), failure_code: null, updated_at: new Date().toISOString() }).eq('id', input.id).eq('user_id', input.userId);
    if (error) { await db.storage.from('together-user-media').remove([path]); throw error; }
  } catch {
    await db.from('together_account_exports').update({ status: 'failed', failure_code: failureCode, storage_path: null, updated_at: new Date().toISOString() }).eq('id', input.id).eq('user_id', input.userId);
  }
}

async function buildAccountExport(db: SupabaseClient, userId: string, email: string | null) {
  const results = await Promise.all(exportTables.map(async (table) => ({ table, result: await db.from(table).select('*').eq('user_id', userId) })));
  const failed = results.find(({ result }) => result.error);
  if (failed?.result.error) throw failed.result.error;
  const data = Object.fromEntries(results.map(({ table, result }) => [table, result.data ?? []])) as Record<string, Array<Record<string, unknown>>>;
  const { data: createdTemplates, error: templateError } = await db.from('together_character_templates').select('*,together_character_versions(*)').eq('creator_id', userId);
  if (templateError) throw templateError;
  const versionIds = (createdTemplates ?? []).flatMap((template) => Array.isArray(template.together_character_versions) ? template.together_character_versions.map((version: Record<string, unknown>) => String(version.id)) : []);
  const [mediaProfiles, referenceAssets] = versionIds.length ? await Promise.all([db.from('together_character_media_profiles').select('id,character_version_id,provider,model_family,profile_kind,status,trigger_word,source_revision,source_reference_asset_ids,trained_at,failure_code,compatibility,metadata,created_at,updated_at').in('character_version_id', versionIds), db.from('together_media_reference_assets').select('id,asset_role,character_version_id,source_key,content_type,width,height,revision,active,metadata,created_at,updated_at').in('character_version_id', versionIds)]) : [{ data: [] }, { data: [] }];
  if (mediaProfiles.error || referenceAssets.error) throw mediaProfiles.error ?? referenceAssets.error;
  const lives = (data.together_continuities ?? []).map((life) => ({ continuity: life, persona: (data.together_user_personas ?? []).find((persona) => persona.id === life.persona_id) ?? null, companions: (data.together_character_instances ?? []).filter((instance) => instance.continuity_id === life.id).map((instance) => ({ instance, relationship: (data.together_relationship_states ?? []).find((row) => row.character_instance_id === instance.id) ?? null, memories: (data.together_memories ?? []).filter((row) => row.character_instance_id === instance.id), plans: (data.together_shared_plans ?? []).filter((row) => row.character_instance_id === instance.id), dates: (data.together_date_sessions ?? []).filter((row) => row.character_instance_id === instance.id), moments: (data.together_moments ?? []).filter((row) => row.character_instance_id === instance.id), stories: (data.together_story_arc_instances ?? []).filter((row) => row.character_instance_id === instance.id), conversations: (data.together_conversations ?? []).filter((row) => row.character_instance_id === instance.id) })) }));
  return { exportedAt: new Date().toISOString(), account: { id: userId, email }, personas: data.together_user_personas ?? [], lives, createdCharacters: createdTemplates ?? [], createdCharacterMediaProfiles: mediaProfiles.data ?? [], createdCharacterReferenceAssets: referenceAssets.data ?? [], raw: data };
}

async function expireAccountExports(db: SupabaseClient, userId: string) {
  const { data } = await db.from('together_account_exports').select('id,storage_bucket,storage_path').eq('user_id', userId).eq('status', 'ready').lte('expires_at', new Date().toISOString());
  for (const item of data ?? []) {
    if (item.storage_path) await queueStorageCleanup(db, userId, String(item.storage_bucket), String(item.storage_path));
    await db.from('together_account_exports').update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() }).eq('id', item.id).eq('user_id', userId);
  }
}

async function removeAvatarWhenUnreferenced(db: SupabaseClient, userId: string, path: string) {
  const [{ data: profile }, { data: personas }] = await Promise.all([db.from('together_profiles').select('avatar_path').eq('user_id', userId).maybeSingle(), db.from('together_user_personas').select('appearance_config').eq('user_id', userId)]);
  const referenced = profile?.avatar_path === path || (personas ?? []).some((item) => record(item.appearance_config).avatarPath === path);
  if (referenced) return;
  const removal = await db.storage.from('together-user-media').remove([path]);
  if (removal.error) await queueStorageCleanup(db, userId, 'together-user-media', path);
}

async function queueStorageCleanup(db: SupabaseClient, userId: string | null, bucket: string, path: string, status: 'held' | 'pending' = 'pending') {
  if (!bucket || !path) return;
  await db.from('together_storage_cleanup_jobs').insert({ user_id: userId, bucket_id: bucket, storage_path: path, status });
}

async function stageDeletionCleanup(db: SupabaseClient, userId: string, storage: Array<{ bucket: string; path: string }>): Promise<{ existingIds: string[]; createdIds: string[] }> {
  if (!storage.length) return { existingIds: [], createdIds: [] };
  const { data: existing, error: existingError } = await db.from('together_storage_cleanup_jobs').select('id,bucket_id,storage_path').eq('user_id', userId).in('status', ['held', 'pending']);
  if (existingError) throw new AppError('INTERNAL_ERROR', 'Your private media could not be staged for deletion. Nothing was deleted.', 500, true);
  const byKey = new Map((existing ?? []).map((item) => [`${item.bucket_id}:${item.storage_path}`, String(item.id)]));
  const existingIds = storage.map((item) => byKey.get(`${item.bucket}:${item.path}`)).filter((id): id is string => Boolean(id));
  const missing = storage.filter((item) => !byKey.has(`${item.bucket}:${item.path}`));
  if (existingIds.length) {
    const held = await db.from('together_storage_cleanup_jobs').update({ status: 'held', updated_at: new Date().toISOString() }).in('id', existingIds);
    if (held.error) throw new AppError('INTERNAL_ERROR', 'Your private media could not be staged for deletion. Nothing was deleted.', 500, true);
  }
  const created = missing.length ? await db.from('together_storage_cleanup_jobs').insert(missing.map((item) => ({ user_id: userId, bucket_id: item.bucket, storage_path: item.path, status: 'held' }))).select('id') : { data: [], error: null };
  if (created.error) {
    if (existingIds.length) await db.from('together_storage_cleanup_jobs').update({ status: 'pending', updated_at: new Date().toISOString() }).in('id', existingIds);
    throw new AppError('INTERNAL_ERROR', 'Your private media could not be staged for deletion. Nothing was deleted.', 500, true);
  }
  return { existingIds, createdIds: (created.data ?? []).map((item) => String(item.id)) };
}

async function rollbackStagedDeletionCleanup(db: SupabaseClient, staged: { existingIds: string[]; createdIds: string[] }) {
  if (staged.createdIds.length) await db.from('together_storage_cleanup_jobs').delete().in('id', staged.createdIds);
  if (staged.existingIds.length) await db.from('together_storage_cleanup_jobs').update({ status: 'pending', updated_at: new Date().toISOString() }).in('id', staged.existingIds);
}

async function ownedStorageManifest(db: SupabaseClient, userId: string): Promise<Array<{ bucket: string; path: string }>> {
  const [generated, attachments, creatorAssets, templates, profile, personas, exports] = await Promise.all([db.from('together_generated_media').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null), db.from('together_conversation_attachments').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null), db.from('together_creator_assets').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null), db.from('together_character_templates').select('id,together_character_versions(id)').eq('creator_id', userId), db.from('together_profiles').select('avatar_path').eq('user_id', userId).maybeSingle(), db.from('together_user_personas').select('appearance_config').eq('user_id', userId), db.from('together_account_exports').select('storage_bucket,storage_path').eq('user_id', userId).not('storage_path', 'is', null)]);
  const sourceError = [generated, attachments, creatorAssets, templates, profile, personas, exports].find((result) => result.error)?.error;
  if (sourceError) throw new AppError('INTERNAL_ERROR', 'Your private media inventory could not be completed. Nothing was deleted.', 500, true);
  const versionIds = (templates.data ?? []).flatMap((template) => Array.isArray(template.together_character_versions) ? template.together_character_versions.map((version: Record<string, unknown>) => String(version.id)) : []);
  const [references, profiles] = versionIds.length ? await Promise.all([db.from('together_media_reference_assets').select('storage_bucket,storage_path').in('character_version_id', versionIds), db.from('together_character_media_profiles').select('model_storage_bucket,model_storage_path,metadata').in('character_version_id', versionIds)]) : [{ data: [] }, { data: [] }];
  if (references.error || profiles.error) throw new AppError('INTERNAL_ERROR', 'Your private creator media inventory could not be completed. Nothing was deleted.', 500, true);
  const byKey = new Map<string, { bucket: string; path: string }>();
  const add = (bucket: unknown, path: unknown) => { if (typeof bucket === 'string' && bucket && typeof path === 'string' && path) byKey.set(`${bucket}:${path}`, { bucket, path }); };
  for (const row of generated.data ?? []) add('together-user-media', row.storage_path);
  for (const row of attachments.data ?? []) add('together-user-media', row.storage_path);
  for (const row of creatorAssets.data ?? []) add('kivelle-character-reference', row.storage_path);
  add('together-user-media', profile.data?.avatar_path);
  for (const row of personas.data ?? []) add('together-user-media', record(row.appearance_config).avatarPath);
  for (const row of exports.data ?? []) add(row.storage_bucket, row.storage_path);
  for (const row of references.data ?? []) add(row.storage_bucket, row.storage_path);
  for (const row of profiles.data ?? []) { add(row.model_storage_bucket ?? 'kivelle-model-assets', row.model_storage_path); const metadata = record(row.metadata); add(metadata.trainingArchiveBucket ?? 'kivelle-model-assets', metadata.trainingArchivePath); }
  return [...byKey.values()];
}

async function processStorageCleanupJobs(db: SupabaseClient, ids: string[]) {
  const { data } = await db.from('together_storage_cleanup_jobs').select('id,bucket_id,storage_path,attempt_count').in('id', ids).eq('status', 'pending');
  for (const job of data ?? []) {
    const removal = await db.storage.from(String(job.bucket_id)).remove([String(job.storage_path)]);
    await db.from('together_storage_cleanup_jobs').update(removal.error ? { attempt_count: Number(job.attempt_count ?? 0) + 1, last_error: 'storage_remove_failed', updated_at: new Date().toISOString() } : { status: 'complete', last_error: null, updated_at: new Date().toISOString() }).eq('id', job.id);
  }
}

async function accountFingerprint(userId: string) {
  const pepper = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('JUKESTR_SUPABASE_SECRET_KEY') ?? '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${userId}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function countExportRecords(value: unknown): number {
  if (Array.isArray(value)) return value.length + value.reduce((sum, item) => sum + countExportRecords(item), 0);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + countExportRecords(item), 0);
  return 0;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
