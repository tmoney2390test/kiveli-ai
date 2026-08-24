import type {
  CharacterInstance,
  Conversation,
  GroupDetail,
  Message,
} from "../types";

export type InboxFilter = "favorites" | "all" | "groups";
export type InboxRow = {
  conversation: Conversation;
  character: CharacterInstance;
  group?: GroupDetail;
};
export type ChatLaunchParams = {
  inbox?: string;
  compose?: string;
  character?: string;
  plan?: string;
  draft?: string;
  location?: string;
  world?: string;
  activity?: string;
  planId?: string;
  repeatPlanId?: string;
};

/**
 * A deliberate inbox destination. The sentinel prevents stale launch params
 * from reopening the conversation that the user just left.
 */
export const MESSAGES_INBOX_HREF = "/chat-tab?inbox=1";

const chatLaunchKeys = [
  "character",
  "plan",
  "draft",
  "location",
  "world",
  "activity",
  "planId",
  "repeatPlanId",
] as const;

export function chatHrefFromInboxParams(
  params: ChatLaunchParams,
): string | null {
  if (params.inbox === "1") return null;
  const entries = chatLaunchKeys.flatMap((key) =>
    params[key] ? [[key, params[key]] as const] : []
  );
  if (!entries.length) return null;
  return `/chat?${
    entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join(
      "&",
    )
  }`;
}

/**
 * A place-planning launch must remount the chat surface even when it targets the
 * conversation already sitting underneath Places in the navigation stack.
 */
export function chatSessionRouteKey(
  conversationId: string | null | undefined,
  params: ChatLaunchParams,
  fallback = "recent",
): string {
  const base = conversationId ?? `pending:${fallback}`;
  if (params.plan !== "1") return `${base}:chat`;
  const scope = [
    params.world,
    params.location,
    params.activity,
    params.repeatPlanId,
  ].map((value) => value ?? "").join(":");
  return `${base}:plan:${scope}`;
}

export function buildInboxRows(
  conversations: Conversation[],
  characters: CharacterInstance[],
  favoriteCharacterTemplateIds: string[],
  query: string,
  filter: InboxFilter,
  groups: GroupDetail[] = [],
): InboxRow[] {
  const favorites = new Set(favoriteCharacterTemplateIds);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return conversations
    .filter(isActiveInboxConversation)
    .map(
      (
        conversation,
      ): {
        conversation: Conversation;
        character: CharacterInstance | undefined;
        group?: GroupDetail;
      } => {
        const group = groups.find((item) =>
          item.conversation.id === conversation.id
        );
        return {
          conversation,
          character: characters.find((character) =>
            character.id === conversation.character_instance_id
          ),
          ...(group ? { group } : {}),
        };
      },
    )
    .filter((row): row is InboxRow =>
      row.character !== undefined &&
      (row.conversation.kind !== "group" || row.group !== undefined)
    )
    .filter(({ conversation, character, group }) => {
      if (filter === "all") return true;
      if (filter === "groups") return Boolean(group);
      if (group) {
        const explicitFavorite = conversation.metadata?.favorite;
        if (typeof explicitFavorite === "boolean") return explicitFavorite;
        return group.participants.some((participant) =>
          favorites.has(
            participant.together_character_instances.character_template_id,
          )
        );
      }
      return favorites.has(character.character_template_id);
    })
    .filter(({ conversation, character, group }) => {
      if (!normalizedQuery) return true;
      const groupNames = group?.participants.map((participant) =>
        participant.together_character_instances.together_character_templates
          .name
      ).join(" ") ?? "";
      return `${character.together_character_templates.name} ${groupNames} ${
        conversation.title ?? ""
      } ${conversation.last_message_preview ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    })
    .sort((left, right) =>
      timestamp(right.conversation.last_message_at) -
      timestamp(left.conversation.last_message_at)
    );
}

/**
 * Persistent groups belong in Messages, but they must not be treated as the
 * anchor companion's active one-to-one conversation elsewhere in the app.
 */
export function isActiveInboxConversation(
  conversation: Conversation,
): boolean {
  return !conversation.archived_at && !conversation.user_archived_at &&
    ["direct", "first_meeting", "group"].includes(conversation.kind);
}

export function inboxPreview(conversation: Conversation): string {
  const preview = conversation.last_message_preview?.replace(/\s+/g, " ")
    .trim();
  if (preview) return preview;
  return conversation.last_message_at
    ? "Loading latest message…"
    : "Start the conversation.";
}

/**
 * Keep the server-hydrated inbox fields when a broader snapshot refresh returns
 * the same conversation without its preview. The canonical conversation row
 * still wins whenever it already contains a preview or is newer than the cache.
 */
export function mergeInboxConversations(
  canonical: Conversation[],
  hydrated: Conversation[],
): Conversation[] {
  const hydratedById = new Map(
    hydrated.map((conversation) => [conversation.id, conversation]),
  );
  return canonical.map((conversation) => {
    if (conversation.last_message_preview?.trim()) return conversation;
    const cached = hydratedById.get(conversation.id);
    if (!cached?.last_message_preview?.trim()) return conversation;
    const canonicalTime = timestamp(conversation.last_message_at);
    const cachedTime = timestamp(cached.last_message_at);
    if (canonicalTime > cachedTime) return conversation;
    return {
      ...conversation,
      last_message_at: cached.last_message_at ?? conversation.last_message_at,
      last_message_preview: cached.last_message_preview,
      last_message_role: cached.last_message_role,
      message_count: cached.message_count ?? conversation.message_count,
      unread: conversation.unread ?? cached.unread,
    };
  });
}

export function conversationWithLastMessage(
  conversation: Conversation,
  message: Message,
): Conversation {
  const preview = message.content.replace(/\s+/g, " ").trim();
  if (!preview) return conversation;
  return {
    ...conversation,
    last_message_at: message.created_at,
    last_message_preview: preview,
    last_message_role: message.role,
  };
}

export function formatInboxTimestamp(
  value: string | null | undefined,
  now = new Date(),
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const sameDay = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const days = Math.max(1, Math.floor(elapsed / 86_400_000));
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(
    [],
    date.getFullYear() === now.getFullYear()
      ? { month: "numeric", day: "numeric" }
      : { month: "numeric", day: "numeric", year: "2-digit" },
  );
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}
