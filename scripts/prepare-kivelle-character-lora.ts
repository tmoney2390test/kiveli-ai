import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { zipSync } from 'fflate';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key!, rest.join('=') || 'true']; }));
const character = args.get('character');
const imagesDirectory = args.get('images');
const apply = args.get('apply') === 'true';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!character || !imagesDirectory) throw new Error('Usage: pnpm media:prepare-lora -- --character=<slug-or-uuid> --images=<directory> [--apply]');
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function main() {
  const templateQuery = db.from('together_character_templates').select('id,slug,name,current_published_version,together_character_versions(id,version)');
  const templateResult = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(character) ? await templateQuery.eq('id', character).maybeSingle() : await templateQuery.eq('slug', character).maybeSingle();
  if (templateResult.error || !templateResult.data) throw new Error('Character template not found.');
  const versions = (templateResult.data.together_character_versions ?? []) as Array<{ id: string; version: number }>;
  const version = [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0];
  if (!version) throw new Error('Character has no version to train.');

  const names = (await readdir(imagesDirectory)).filter((name) => allowed.has(extname(name).toLowerCase())).sort();
  if (names.length < 10 || names.length > 20) throw new Error(`LoRA training requires 10–20 curated images; found ${names.length}.`);
  const source = await Promise.all(names.map(async (name) => ({ name, bytes: await readFile(join(imagesDirectory, name)) })));
  const hashes = source.map((item) => createHash('sha256').update(item.bytes).digest('hex'));
  if (new Set(hashes).size !== hashes.length) throw new Error('Training set contains duplicate image bytes. Use varied identity references instead of duplicated portraits.');

  const latestProfile = await db.from('together_character_media_profiles').select('source_revision').eq('character_version_id', version.id).eq('provider', 'wavespeed').eq('model_family', 'z-image').order('source_revision', { ascending: false }).limit(1).maybeSingle();
  if (latestProfile.error) throw latestProfile.error;
  const sourceRevision = Number(latestProfile.data?.source_revision ?? 0) + 1;
  const triggerWord = `KIVELLE_${String(templateResult.data.slug).replace(/[^a-z0-9]/gi, '_').toUpperCase()}_${sourceRevision}`;
  const summary = { character: templateResult.data.slug, characterVersionId: version.id, sourceRevision, imageCount: source.length, uniqueImages: new Set(hashes).size, mode: apply ? 'apply' : 'dry-run' };
  if (!apply) { console.log(JSON.stringify(summary)); return; }

  const referenceIds: string[] = [];
  const archiveFiles: Record<string, Uint8Array> = {};
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index]!;
    const hash = hashes[index]!;
    const extension = extname(item.name).toLowerCase();
    const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    const storagePath = `character_training/${templateResult.data.slug}/revision-${sourceRevision}/${hash.slice(0, 20)}${extension}`;
    const uploaded = await db.storage.from('kivelle-reference-media').upload(storagePath, item.bytes, { contentType, upsert: false, cacheControl: '31536000' });
    if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error;
    const inserted = await db.from('together_media_reference_assets').insert({ asset_role: 'character_training', character_version_id: version.id, source_key: `character:${templateResult.data.slug}:training:${sourceRevision}:${index + 1}`, storage_bucket: 'kivelle-reference-media', storage_path: storagePath, content_type: contentType, byte_size: item.bytes.byteLength, sha256: hash, revision: sourceRevision, active: true, metadata: { sourceFile: basename(item.name), preparedBy: 'prepare-kivelle-character-lora' } }).select('id').single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error('Reference asset could not be recorded.');
    referenceIds.push(String(inserted.data.id));
    archiveFiles[`${String(index + 1).padStart(2, '0')}${extension}`] = new Uint8Array(item.bytes);
  }

  const archive = zipSync(archiveFiles, { level: 6 });
  const archiveHash = createHash('sha256').update(archive).digest('hex');
  const archivePath = `training/${version.id}/revision-${sourceRevision}-${archiveHash.slice(0, 20)}.zip`;
  const archiveUpload = await db.storage.from('kivelle-model-assets').upload(archivePath, archive, { contentType: 'application/zip', upsert: false, cacheControl: 'private,max-age=31536000' });
  if (archiveUpload.error && !/already exists|duplicate/i.test(archiveUpload.error.message)) throw archiveUpload.error;
  const profile = await db.from('together_character_media_profiles').insert({ character_version_id: version.id, provider: 'wavespeed', model_family: 'z-image', profile_kind: 'character_lora', trigger_word: triggerWord, source_reference_asset_ids: referenceIds, source_revision: sourceRevision, status: 'pending', training_params: { steps: 1200, learningRate: 0.0002, loraRank: 32 }, compatibility: { modelFamily: 'z-image', provider: 'wavespeed' }, metadata: { trainingArchiveBucket: 'kivelle-model-assets', trainingArchivePath: archivePath, archiveSha256: archiveHash, preparedBy: 'prepare-kivelle-character-lora' } }).select('id,status').single();
  if (profile.error || !profile.data) throw profile.error ?? new Error('Character media profile could not be queued.');
  console.log(JSON.stringify({ ...summary, characterMediaProfileId: profile.data.id, status: profile.data.status }));

  const dispatchSecret = process.env.TOGETHER_MEDIA_DISPATCH_SECRET;
  if (dispatchSecret) await fetch(`${url}/functions/v1/together-media-dispatch`, { method: 'POST', headers: { 'x-together-dispatch-secret': dispatchSecret, 'Content-Type': 'application/json' }, body: '{"limit":2}' }).catch(() => undefined);
}

await main();
