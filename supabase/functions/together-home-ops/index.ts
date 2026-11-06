import { z } from "zod";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { parseBody } from "../_shared/body.ts";
import { json, serve } from "../_shared/http.ts";
import {
  recordOperationsAudit,
  requireOperationsRole,
} from "../_shared/kivelle-ops.ts";
import { AppError } from "../_shared/types.ts";
import { waitUntil } from "../_shared/background.ts";
import {
  approveHomeArtwork,
  generateHomeArtwork,
  refreshHomePlanningLocations,
} from "../_shared/character-home-artwork.ts";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), worldSlug: z.string().regex(/^[a-z0-9-]+$/).max(80).default("eos-meridian") }),
  z.object({ action: z.literal("generate"), homeId: z.string().uuid() }),
  z.object({ action: z.literal("process_next"), worldSlug: z.string().regex(/^[a-z0-9-]+$/).max(80).default("eos-meridian") }),
  z.object({
    action: z.literal("approve"),
    homeId: z.string().uuid(),
    artworkId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("edit"),
    homeId: z.string().uuid(),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(80).max(1600),
    prompt: z.string().trim().min(300).max(5000),
    details: z.array(
      z.object({
        id: z.string().max(40),
        description: z.string().trim().min(8).max(350),
      }),
    ).length(3),
    activities: z.array(z.string().trim().min(3).max(100)).min(4).max(8),
    invitationsEnabled: z.boolean(),
  }),
]);
serve(async (request, correlationId) => {
  const { db, user } = await authenticated(request);
  const role = requireOperationsRole(user, "admin");
  const input = await parseBody(request, schema);
  await enforceRateLimit(
    db,
    user.id,
    input.action === "list" ? "home_operations_read" : "home_operations_write",
    input.action === "list" ? 1200 : 300,
    3600,
  );
  // Expired workers must become retryable even when the administrator is only
  // watching the list. This never starts a replacement or buys another image.
  await db.from("together_home_artwork").update({
    status: "failed",
    error_code: "WORKER_INTERRUPTED",
    lease_until: null,
  })
    .eq("status", "generating").lt("lease_until", new Date().toISOString());
  if (input.action === "list") {
    const [homes,worlds] = await Promise.all([
      db.from("together_character_homes").select(
        "id,name,description,prompt_text,artwork_prompt,personal_details,possible_activities,approved_artwork_id,invitation_config,together_worlds!inner(name,slug),artwork:together_home_artwork!together_home_artwork_home_id_fkey(id,status,created_at,error_code,cost_usd,storage_bucket,storage_path,thumbnail_path)",
      ).eq("active",true).eq("visits_enabled", true).eq("together_worlds.slug",input.worldSlug).order("name"),
      db.from("together_worlds").select("name,slug").eq("published",true).order("name"),
    ]);
    if (homes.error || worlds.error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Homes could not be loaded.",
        503,
        true,
      );
    }
    return json(
      {
        data: {
          worlds: worlds.data ?? [],
          homes: (homes.data ?? []).map((home: any) => ({
            ...home,
            prompt_text: home.artwork_prompt ?? home.prompt_text,
            artwork: (home.artwork ?? []).map((art: any) => ({
              ...art,
              url: art.storage_path
                ? db.storage.from(art.storage_bucket).getPublicUrl(
                  art.thumbnail_path ?? art.storage_path,
                ).data.publicUrl
                : null,
            })),
          })),
        },
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "process_next") {
    const { data: job,error } = await db.from("together_home_artwork").select("id,home:together_character_homes!together_home_artwork_home_id_fkey!inner(visits_enabled,world:together_worlds!inner(slug))")
      .eq("status", "queued").eq("home.visits_enabled",true).eq("home.world.slug",input.worldSlug).order("created_at").limit(1).maybeSingle();
    if(error)throw new AppError("INTERNAL_ERROR","Queued images could not be checked.",503,true);
    if (job) waitUntil(generateHomeArtwork(db, job.id));
    if (job) {
      await recordOperationsAudit(db, {
        actorUserId: user.id,
        actorRole: role,
        action: "home_generate",
        targetType: "home_artwork",
        targetId: job.id,
        reasonSafe: "Start queued home artwork",
        metadata: {},
      });
    }
    return json(
      {
        data: { started: Boolean(job), jobId: job?.id ?? null },
        correlationId,
      },
      200,
      correlationId,
    );
  }
  const { data: home } = await db.from("together_character_homes").select("*")
    .eq("id", input.homeId).eq("visits_enabled", true).maybeSingle();
  if (!home) {
    throw new AppError("NOT_FOUND", "That character home is unavailable.", 404);
  }
  if (input.action === "approve") {
    await approveHomeArtwork(db, home.id, input.artworkId);
  }
  if (input.action === "edit") {
    const scene=[input.description,home.canonical_visual_context?.interiorStyle,home.canonical_visual_context?.windowOutlook,...input.details.map(d=>d.description),"Use the scene’s current local time and lighting."].filter(Boolean).join(" ");
    if(scene.length<300)throw new AppError("VALIDATION_FAILED","Add a little more about the room, its view, or the things inside it.",400);
    const { error } = await db.from("together_character_homes").update({
      name: input.name,
      description: input.description,
      prompt_text: scene,
      artwork_prompt: input.prompt,
      personal_details: input.details,
      possible_activities: [...new Set(input.activities)],
      canonical_lore: {
        ...home.canonical_lore,
        summary: input.description,
        personalDetails: input.details,
      },
      canonical_visual_context: {
        ...home.canonical_visual_context,
        canonicalPrompt: scene,
        recurringObjects: input.details.map((detail) => detail.description),
      },
      invitation_config: {
        ...home.invitation_config,
        enabled: input.invitationsEnabled,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", home.id);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Home changes could not be saved.",
        503,
        true,
      );
    }
    const queued = await db.from("together_home_artwork").update({
      prompt_text: input.prompt,
    }).eq("home_id", home.id).eq("status", "queued");
    if (queued.error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The home was saved, but its queued image needs updating. Save again to retry.",
        503,
        true,
      );
    }
    await refreshHomePlanningLocations(db, home.id);
  }
  if (input.action === "generate") {
    const { data: pending } = await db.from("together_home_artwork").select(
      "id,status",
    ).eq("home_id", home.id).in("status", ["queued", "generating"])
      .maybeSingle();
    if (pending?.status === "generating") {
      return json(
        { data: { jobId: pending.id }, correlationId },
        200,
        correlationId,
      );
    }
    let jobId = pending?.id;
    if (!jobId) {
      const result = await db.from("together_home_artwork").insert({
        home_id: home.id,
        prompt_text: home.artwork_prompt ?? home.prompt_text,
        requested_by: user.id,
      }).select("id").single();
      if (result.error) {
        throw new AppError(
          "CONFLICT",
          "A home image is already queued. Refresh the list.",
          409,
          true,
        );
      }
      jobId = result.data.id;
    }
    waitUntil(generateHomeArtwork(db, jobId));
  }
  await recordOperationsAudit(db, {
    actorUserId: user.id,
    actorRole: role,
    action: `home_${input.action}`,
    targetType: "character_home",
    targetId: home.id,
    reasonSafe: "Character home administration",
    metadata: {},
  });
  return json({ data: { saved: true }, correlationId }, 200, correlationId);
});
