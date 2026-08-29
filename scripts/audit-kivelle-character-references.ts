import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function allRows<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return rows;
  }
}

type Template = { id: string; name: string; slug: string; creator_id: string | null; current_published_version: number; published: boolean; lifecycle_status: string; visibility: string };
type Version = { id: string; character_template_id: string; version: number; visual_identity: Record<string, unknown> | null };
type Reference = { id: string; character_version_id: string | null; storage_bucket: string; storage_path: string; asset_role: string; active: boolean };

async function inaccessibleReferences(client: SupabaseClient, references: Reference[]) {
  const inaccessible: Reference[] = [];
  const byBucket = Map.groupBy(references, (reference) => reference.storage_bucket);
  for (const [bucket, bucketReferences] of byBucket) {
    for (let index = 0; index < bucketReferences.length; index += 100) {
      const batch = bucketReferences.slice(index, index + 100);
      const { data, error } = await client.storage.from(bucket).createSignedUrls(batch.map((item) => item.storage_path), 60);
      if (error || !data) { inaccessible.push(...batch); continue; }
      data.forEach((result, resultIndex) => { if (result.error || !result.signedUrl) inaccessible.push(batch[resultIndex]!); });
    }
  }
  return inaccessible;
}

const [templates, versions, instances, references] = await Promise.all([
  allRows<Template>('together_character_templates', 'id,name,slug,creator_id,current_published_version,published,lifecycle_status,visibility'),
  allRows<Version>('together_character_versions', 'id,character_template_id,version,visual_identity'),
  allRows<{ character_version_id: string }>('together_character_instances', 'character_version_id'),
  allRows<Reference>('together_media_reference_assets', 'id,character_version_id,storage_bucket,storage_path,asset_role,active'),
]);

const versionById = new Map(versions.map((version) => [version.id, version]));
const templateById = new Map(templates.map((template) => [template.id, template]));
const identityReferences = references.filter((reference): reference is Reference & { character_version_id: string } => reference.active && reference.asset_role === 'character_identity' && Boolean(reference.character_version_id));
const referenceByVersion = Map.groupBy(identityReferences, (reference) => reference.character_version_id);
const activeOfficialVersions = templates
  .filter((template) => template.creator_id === null && template.published && template.lifecycle_status === 'published' && template.visibility === 'public')
  .map((template) => versions.find((version) => version.character_template_id === template.id && version.version === template.current_published_version))
  .filter((version): version is Version => Boolean(version));
const usedVersionIds = new Set(instances.map((instance) => instance.character_version_id));
const targetVersions = new Map<string, Version>();
activeOfficialVersions.forEach((version) => targetVersions.set(version.id, version));
usedVersionIds.forEach((versionId) => { const version = versionById.get(versionId); if (version) targetVersions.set(versionId, version); });

const missing = [...targetVersions.values()].filter((version) => {
  if ((referenceByVersion.get(version.id) ?? []).length) return false;
  const paths = version.visual_identity?.referenceStoragePaths;
  return !Array.isArray(paths) || paths.filter(Boolean).length === 0;
});
const inaccessible = await inaccessibleReferences(db, identityReferences);
const label = (version: Version) => {
  const template = templateById.get(version.character_template_id);
  return `${template?.name ?? 'Unknown'} (${template?.slug ?? version.character_template_id}) v${version.version}`;
};

console.log(JSON.stringify({
  officialPublishedCompanions: activeOfficialVersions.length,
  companionVersionsUsedByAccounts: usedVersionIds.size,
  auditedCompanionVersions: targetVersions.size,
  activeIdentityReferences: identityReferences.length,
  missingCanonicalReference: missing.length,
  inaccessibleStoredReference: inaccessible.length,
  missing: missing.map(label),
  inaccessible: inaccessible.map((reference) => label(versionById.get(reference.character_version_id)!)),
}, null, 2));

if (missing.length || inaccessible.length) process.exitCode = 1;
