import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";

export const GROUP_ELIGIBLE_INSTANCE_SELECT =
  "id,character_version_id,introduced_at,contact_added_at,together_character_templates(name,slug),together_character_versions(id,portrait_asset_key,visual_identity)";

export function hasMetCompanionForGroup(
  instance: Record<string, unknown>,
): boolean {
  return Boolean(instance.introduced_at || instance.contact_added_at);
}

export async function eligibleGroupInstances(
  db: SupabaseClient,
  userId: string,
  continuityId: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.from("together_character_instances").select(
    GROUP_ELIGIBLE_INSTANCE_SELECT,
  ).eq("user_id", userId).eq("continuity_id", continuityId).in("id", ids);
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Companion eligibility could not be verified.",
      500,
      true,
    );
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).filter(
    hasMetCompanionForGroup,
  );
}
