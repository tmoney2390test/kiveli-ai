import { configuredImageProvider } from "./together-media-base.ts";
import { AppError } from "./types.ts";

/** One leased, explicitly queued catalog image. Never called by navigation. */
export async function generateHomeArtwork(
  db: any,
  jobId: string,
): Promise<void> {
  const now = new Date(),
    lease = new Date(now.getTime() + 5 * 60000).toISOString();
  const claimed = await db.from("together_home_artwork").update({
    status: "generating",
    lease_until: lease,
    error_code: null,
  }).eq("id", jobId).eq("status", "queued").select("*").maybeSingle();
  if (claimed.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The artwork job could not start.",
      503,
      true,
    );
  }
  if (!claimed.data) return; // Concurrent processors cannot purchase the same image twice.
  const job = claimed.data;
  try {
    const { data: home } = await db.from("together_character_homes").select(
      "id,character_version_id,active,visits_enabled,source",
    ).eq("id", job.home_id).single();
    // Explicit catalog jobs can be prepared before visits are released. A user
    // opening a home still cannot queue artwork or enable visits.
    if (!home?.active || (!home.visits_enabled && home.source !== 'authored')) throw new Error("HOME_DISABLED");
    const provider = configuredImageProvider();
    if (!provider) throw new Error("IMAGE_PROVIDER_UNAVAILABLE");
    const result = await provider.generate({
      mediaId: job.id,
      generationKind: "home_environment",
      companion: {
        templateId: home.id,
        versionId: home.character_version_id,
        name: "Empty home interior",
        age: 30,
      },
      visualIdentity: {
        canonicalDescription: "No people in this environment photograph.",
        age: 30,
        referenceStoragePaths: [],
      },
      referenceImages: [],
      context: {},
      composition: { shotType: "scene", aspectRatio: "16:9" },
      contentLevel: "standard",
      qualityTier: "standard",
      generationIntent: {
        requestText: job.prompt_text,
        requestedContentLevel: "standard",
      },
    });
    const extension = result.contentType === "image/png"
      ? "png"
      : result.contentType === "image/webp"
      ? "webp"
      : "jpg";
    const path = `${home.id}/${job.id}.${extension}`;
    const upload = await db.storage.from(job.storage_bucket).upload(
      path,
      result.bytes,
      {
        contentType: result.contentType,
        cacheControl: "31536000",
        upsert: false,
      },
    );
    if (upload.error) throw new Error("HOME_ART_UPLOAD_FAILED");
    let thumbnailPath: string | null = null;
    // Storage transformations reuse the original. If unavailable, the original
    // remains usable; this never causes a second paid image generation.
    try {
      const preview = await db.storage.from(job.storage_bucket).download(path, {
        transform: { width: 640, height: 360, resize: "cover", quality: 72 },
      });
      if (preview.data && !preview.error) {
        const type = preview.data.type || result.contentType;
        const ext = type === "image/png"
          ? "png"
          : type === "image/webp"
          ? "webp"
          : "jpg";
        const thumbnail = `${home.id}/${job.id}-preview.${ext}`;
        const saved = await db.storage.from(job.storage_bucket).upload(
          thumbnail,
          preview.data,
          { contentType: type, cacheControl: "31536000", upsert: false },
        );
        if (!saved.error) thumbnailPath = thumbnail;
      }
    } catch { /* optional cached derivative */ }
    const finished = await db.from("together_home_artwork").update({
      status: "ready",
      storage_path: path,
      thumbnail_path: thumbnailPath,
      width: result.width,
      height: result.height,
      provider: provider.id,
      model: result.model,
      cost_usd: result.estimatedCost ?? null,
      completed_at: new Date().toISOString(),
      lease_until: null,
    }).eq("id", job.id).eq("status", "generating").eq("lease_until", lease);
    if (finished.error) throw new Error("HOME_ART_SAVE_FAILED");
  } catch (error) {
    await db.from("together_home_artwork").update({
      status: "failed",
      error_code: error instanceof Error
        ? error.message.slice(0, 100)
        : "HOME_ART_FAILED",
      lease_until: null,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("lease_until", lease);
  }
}

export async function approveHomeArtwork(
  db: any,
  homeId: string,
  artworkId: string,
) {
  const { data: art, error } = await db.from("together_home_artwork").select(
    "*",
  ).eq("id", artworkId).eq("home_id", homeId).eq("status", "ready")
    .maybeSingle();
  if (error || !art) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Choose a finished image from this home’s history.",
      400,
    );
  }
  const saved = await db.from("together_character_homes").update({
    approved_artwork_id: art.id,
    reference_policy: "optional",
    updated_at: new Date().toISOString(),
  }).eq("id", homeId);
  if (saved.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The home image could not be approved.",
      503,
      true,
    );
  }
  await refreshHomePlanningLocations(db, homeId);
}

export async function refreshHomePlanningLocations(db: any, homeId: string) {
  const { data: locations } = await db.from("together_locations").select(
    "owner_user_id,metadata",
  ).eq("character_home_id", homeId);
  // Refresh private adapters and their environment references without changing any plans.
  const { data: home } = await db.from("together_character_homes").select(
    "character_version_id",
  ).eq("id", homeId).single();
  for (const location of locations ?? []) {
    const { data: profile } = await db.from("together_profiles").select(
      "active_continuity_id",
    ).eq("user_id", location.owner_user_id).maybeSingle();
    const { data: instance } = await db.from("together_character_instances")
      .select("id").eq("user_id", location.owner_user_id).eq(
        "character_version_id",
        home.character_version_id,
      ).eq("continuity_id", profile?.active_continuity_id).limit(1)
      .maybeSingle();
    if (instance) {
      const result = await db.rpc("kivelle_ensure_home_location", {
        p_user_id: location.owner_user_id,
        p_character_instance_id: instance.id,
      });
      if (result.error) {
        throw new AppError(
          "INTERNAL_ERROR",
          "The home was saved, but an existing visit needs refreshing. Save again to retry.",
          503,
          true,
        );
      }
    }
  }
}
