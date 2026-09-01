import type {
  CharacterInstance,
  Conversation,
  GroupParticipant,
  Message,
} from "../types";

export type InboxFilter = "all" | "unread" | "favorites" | "groups";
export type InboxGroupDetail = {
  conversation: Conversation;
  participants: GroupParticipant[];
};
export type InboxPage = {
  conversations: Conversation[];
  groups: InboxGroupDetail[];
  pageInfo: { hasMore: boolean; nextOffset: number | null };
};
export type InboxRow = {
  conversation: Conversation;
  character: CharacterInstance;
  group?: InboxGroupDetail;
};
export type InboxSection = {
  key: "pinned" | "recent";
  title: "Pinned" | "Recent";
  data: InboxRow[];
};
export type ChatLaunchParams = {
  inbox?: string;
  compose?: string;
  character?: string;
  conversationId?: string;
  plan?: string;
  draft?: string;
  location?: string;
  world?: string;
  activity?: string;
  planId?: string;
  repeatPlanId?: string;
  switchPlanId?: string;
};

/**
 * A deliberate inbox destination. The sentinel prevents stale launch params
 * from reopening the conversation that the user just left.
 */
export const MESSAGES_INBOX_HREF = "/chat-tab?inbox=1";
export const MESSAGES_INBOX_ROUTE = "/(tabs)/chat-tab?inbox=1";

/**
 * Leaves a root Stack conversation for the explicit nested Messages route.
 * The route-group segment matters here: the public `/chat-tab` URL is
 * ambiguous to Expo Router when navigation begins outside the Tabs navigator
 * and can restore its first tab (Home) instead.
 */
export function returnToMessagesInbox({
  reset,
  navigate,
  schedule = (action) => setTimeout(action, 32),
}: {
  reset: (href: string) => void;
  navigate: (href: string) => void;
  schedule?: (action: () => void) => unknown;
}): void {
  // A root Stack screen cannot reliably select a nested Expo tab in the same
  // navigation transaction: the Tabs navigator mounts its initial Home route.
  // Mount the tab shell first, then select Messages on the following frame.
  reset('/home');
  schedule(() => navigate(MESSAGES_INBOX_HREF));
}

export function shouldOpenMostRecentChat(pathname:string):boolean{
  const normalized=pathname.replace(/^\/\(tabs\)/,'').replace(/\/$/,'')||'/';
  return ['/home','/explore','/moments'].includes(normalized);
}

export function mostRecentChatHref(conversations:Conversation[],characters:CharacterInstance[]):string|null{
  const ordered=conversations.filter(isActiveInboxConversation).sort((left,right)=>conversationActivityTime(right)-conversationActivityTime(left));
  for(const conversation of ordered){
    if(conversation.kind==='group')return`/group-chat?id=${encodeURIComponent(conversation.id)}`;
    const character=characters.find((item)=>item.id===conversation.character_instance_id);
    if(character){
      const template=character.together_character_templates;
      const handle=template.public_handle??template.slug;
      if(handle)return`/chat?character=${encodeURIComponent(handle)}`;
    }
  }
  return null;
}

const chatLaunchKeys = [
  "character",
  "conversationId",
  "plan",
  "draft",
  "location",
  "world",
  "activity",
  "planId",
  "repeatPlanId",
  "switchPlanId",
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
    params.switchPlanId,
  ].map((value) => value ?? "").join(":");
  return `${base}:plan:${scope}`;
}

export function buildInboxRows(
  conversations: Conversation[],
  characters: CharacterInstance[],
  favoriteCharacterTemplateIds: string[],
  query: string,
  filter: InboxFilter,
  groups: InboxGroupDetail[] = [],
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
        group?: InboxGroupDetail;
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
    .filter((row): row is InboxRow => row.character !== undefined)
    .filter(({ conversation, character, group }) => {
      if (filter === "all") return true;
      if (filter === "unread") return conversation.unread === true;
      if (filter === "groups") return conversation.kind === "group";
      if (conversation.kind === "group") {
        const explicitFavorite = conversation.metadata?.favorite;
        if (typeof explicitFavorite === "boolean") return explicitFavorite;
        return group?.participants.some((participant) =>
          favorites.has(
            participant.together_character_instances.character_template_id,
          )
        ) ?? false;
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
    .sort((left, right) => {
      const pinned = Number(isConversationPinned(right.conversation)) -
        Number(isConversationPinned(left.conversation));
      if (pinned) return pinned;
      return timestamp(right.conversation.last_message_at) -
        timestamp(left.conversation.last_message_at);
    });
}

export function buildInboxSections(rows: InboxRow[]): InboxSection[] {
  const pinned = rows.filter((row) => isConversationPinned(row.conversation));
  const recent = rows.filter((row) => !isConversationPinned(row.conversation));
  return [
    ...(pinned.length
      ? [{ key: "pinned" as const, title: "Pinned" as const, data: pinned }]
      : []),
    ...(recent.length
      ? [{ key: "recent" as const, title: "Recent" as const, data: recent }]
      : []),
  ];
}

export function mergeInboxGroups(
  current: InboxGroupDetail[],
  incoming: InboxGroupDetail[],
): InboxGroupDetail[] {
  const merged = new Map(current.map((group) => [group.conversation.id, group]));
  for (const group of incoming) merged.set(group.conversation.id, group);
  return [...merged.values()];
}

export function mergeInboxPages(
  current: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  const merged = new Map(current.map((conversation) => [conversation.id, conversation]));
  for (const conversation of incoming) merged.set(conversation.id, conversation);
  return [...merged.values()];
}

export function isConversationPinned(conversation: Conversation): boolean {
  return conversation.metadata?.pinned === true;
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

export function inboxPreview(
  conversation: Conversation,
  options: { draft?: string | null } = {},
): string {
  const draft = options.draft?.replace(/\s+/g, " ").trim();
  if (draft) return `Draft: ${draft}`;
  if (conversation.last_message_delivery_status === "failed") {
    return "Message failed · Open to retry";
  }
  if (conversation.reply_pending) return "Generating a response…";
  const preview = conversation.last_message_preview?.replace(/\s+/g, " ")
    .trim();
  const attachment = conversation.last_message_attachment_kind === "image"
    ? "Photo"
    : conversation.last_message_attachment_kind === "audio"
    ? "Voice message"
    : conversation.last_message_attachment_kind === "video"
    ? "Video"
    : "";
  const cleanedPreview = preview === "[Photo]" ? "" : preview ?? "";
  const content = attachment && cleanedPreview
    ? `${attachment} · ${cleanedPreview}`
    : attachment || (preview === "[Photo]" ? "Photo" : cleanedPreview);
  if (content) {
    return conversation.last_message_role === "user" ? `You: ${content}` : content;
  }
  return conversation.last_message_at
    ? "Continue the conversation."
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
      last_message_delivery_status: cached.last_message_delivery_status,
      last_message_attachment_kind: cached.last_message_attachment_kind,
      reply_pending: conversation.reply_pending ?? cached.reply_pending,
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

function conversationActivityTime(conversation:Conversation):number{
  return timestamp(conversation.last_message_at??conversation.updated_at??conversation.created_at??null);
}
