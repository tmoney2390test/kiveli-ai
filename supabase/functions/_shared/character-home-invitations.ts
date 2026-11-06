import {
  homeActivityKey,
  homeInvitationEligible,
  type HomeNewsContext,
  recentHomeNews,
} from "../../../packages/together-domain/src/home-visits.ts";
import { isQuietHours } from "../../../packages/together-domain/src/life.ts";
import {
  decideHomeVisit,
  homePlanningLocation,
  loadCharacterHome,
} from "./character-homes.ts";

/** Called only after a real, successful user/companion turn, never by a cron. */
export async function maybeOfferHomeVisit(
  db: any,
  input: {
    userId: string;
    characterInstanceId: string;
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    worldNews?: HomeNewsContext[];
  },
) {
  // Sparse, stable selection means retrying the same turn never rerolls an offer.
  const sample = [...input.userMessageId].reduce(
    (n, c) => n + c.charCodeAt(0),
    0,
  );
  if (sample % 9 !== 0) return;
  const now = new Date();
  const preferences = await db.from("together_notification_preferences").select(
    "character_initiated_messages,initiative_level,companion_initiative_levels,quiet_hours_start,quiet_hours_end,timezone",
  ).eq("user_id", input.userId).maybeSingle();
  if (
    preferences.error ||
    preferences.data?.character_initiated_messages === false ||
    preferences.data?.initiative_level === "off" ||
    preferences.data?.companion_initiative_levels
        ?.[input.characterInstanceId] === "off"
  ) return;
  if (
    isQuietHours(
      now,
      preferences.data?.quiet_hours_start ?? "23:00",
      preferences.data?.quiet_hours_end ?? "08:00",
      preferences.data?.timezone ?? "UTC",
    )
  ) return;
  const [message, conversation, pending, plans, history] = await Promise.all([
    db.from("together_messages").select("created_at").eq(
      "id",
      input.userMessageId,
    ).eq("user_id", input.userId).eq("conversation_id", input.conversationId)
      .eq("role", "user").maybeSingle(),
    db.from("together_conversations").select(
      "character_instance_id,continuity_id,archived_at",
    ).eq("id", input.conversationId).eq("user_id", input.userId).maybeSingle(),
    db.from("together_conversation_actions").select("id").eq(
      "user_id",
      input.userId,
    ).eq("conversation_id", input.conversationId).eq("status", "pending").gt(
      "expires_at",
      now.toISOString(),
    ).limit(1),
    db.from("together_shared_plans").select("id").eq("user_id", input.userId)
      .contains("participant_instance_ids", [input.characterInstanceId]).in(
        "status",
        ["proposed", "scheduled", "active"],
      ).lt("starts_at", new Date(now.getTime() + 2 * 3600000).toISOString()).gt(
        "ends_at",
        now.toISOString(),
      ).limit(1),
    db.from("together_home_invitations").select("created_at,activity_key").eq(
      "user_id",
      input.userId,
    ).eq("character_instance_id", input.characterInstanceId).gte(
      "created_at",
      new Date(now.getTime() - 30 * 86400000).toISOString(),
    ).order("created_at", { ascending: false }),
  ]);
  if (
    [message, conversation, pending, plans, history].some((r) => r.error) ||
    !message.data || !conversation.data || conversation.data.archived_at ||
    conversation.data.character_instance_id !== input.characterInstanceId ||
    now.getTime() - Date.parse(message.data.created_at) > 120000
  ) return;
  const details = await loadCharacterHome(
    db,
    input.userId,
    input.characterInstanceId,
  ).catch(() => null);
  if (!details?.availability.available) return;
  if (
    details.availability.validUntil &&
    Date.parse(details.availability.validUntil) - now.getTime() < 45 * 60000
  ) return;
  const { data: home } = await db.from("together_character_homes").select(
    "invitation_config",
  ).eq("id", details.home.id).maybeSingle();
  if (!home || home.invitation_config?.enabled === false) return;
  // Sometimes suggest coming to the user's home instead. The companion must
  // still be at their own home and free before making either kind of offer.
  const userHomeResult = sample % 2 === 0
    ? await db.from("together_locations").select("*").eq(
      "owner_user_id",
      input.userId,
    ).eq("world_id", details.home.world_id).eq("category", "home").is(
      "character_home_id",
      null,
    ).is("archived_at", null).order("created_at").limit(1).maybeSingle()
    : null;
  const userHome = userHomeResult?.error ? null : userHomeResult?.data;
  const activities: string[] = userHome?.possible_activities?.length
    ? userHome.possible_activities
    : details.home.possible_activities;
  const news = recentHomeNews(
    input.worldNews ?? [],
    details.home.world_id,
    now,
  );
  const orderedActivities = news
    ? [
      ...activities.filter((label) =>
        homeActivityKey(label) === "just_hang_out"
      ),
      ...activities.filter((label) =>
        homeActivityKey(label) !== "just_hang_out"
      ),
    ]
    : activities;
  const activity =
    orderedActivities.find((label: string) =>
      !(history.data ?? []).some((row: any) =>
        row.activity_key === homeActivityKey(label)
      )
    ) ?? activities[0];
  if (!activity) return;
  const activityKey = homeActivityKey(activity);
  if (
    !homeInvitationEligible({
      activeTurn: true,
      atOwnHome: details.availability.atHome,
      sleeping: details.availability.state === "sleeping",
      available: details.availability.available,
      allowed: true,
      hasPlan: Boolean(plans.data?.length),
      hasPendingAction: Boolean(pending.data?.length),
      now,
      history: history.data ?? [],
      activityKey,
      ...home.invitation_config,
    })
  ) return;
  const destination = userHome ? "my_home" : "their_home";
  const welcome = await decideHomeVisit(db, { ...input, destination });
  if (!welcome.allowed) return;
  const place = userHome ??
    (await homePlanningLocation(db, input.userId, input.characterInstanceId))
      .place;
  const expiresAt = new Date(
    Math.min(
      now.getTime() + 2 * 3600000,
      details.availability.validUntil
        ? Date.parse(details.availability.validUntil)
        : Infinity,
    ),
  ).toISOString();
  const result = await db.rpc("kivelle_offer_home_visit", {
    p_user_id: input.userId,
    p_instance_id: input.characterInstanceId,
    p_conversation_id: input.conversationId,
    p_user_message_id: input.userMessageId,
    p_assistant_message_id: input.assistantMessageId,
    p_home_id: details.home.id,
    p_activity_key: activityKey,
    p_expires_at: expiresAt,
    p_payload: {
      homeId: details.home.id,
      homeInvitation: true,
      homeVisitDestination: destination,
      locationId: place.id,
      location: place.name,
      locationSlug: place.slug,
      activityKey,
      activityIntent: activity,
      title: `${activity} at ${place.name}`,
      reasoningCode: news ? "company_after_world_news" : "at_home_invitation",
      ...(news
        ? {
          worldPulseEventId: news.id,
          reason: "Some company after today’s news.",
        }
        : {}),
      trigger: "active_conversation_home",
      requiresConfirmation: true,
    },
  });
  if (result.error) {
    console.warn("Home invitation was not saved", result.error.code);
  }
}
