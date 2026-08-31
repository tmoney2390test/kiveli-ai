import { describe, expect, it } from "vitest";
import type {
  CharacterInstance,
  Conversation,
  GroupDetail,
  Message,
} from "../types";
import {
  buildInboxRows,
  buildInboxSections,
  chatHrefFromInboxParams,
  chatSessionRouteKey,
  conversationWithLastMessage,
  formatInboxTimestamp,
  inboxPreview,
  MESSAGES_INBOX_HREF,
  MESSAGES_INBOX_ROUTE,
  mergeInboxConversations,
  mergeInboxGroups,
  mergeInboxPages,
  isConversationPinned,
  mostRecentChatHref,
  returnToMessagesInbox,
  shouldOpenMostRecentChat,
} from "./messageInbox";

const character = (
  id: string,
  templateId: string,
  name: string,
): CharacterInstance => ({
  id,
  user_id: "user",
  character_template_id: templateId,
  character_version_id: `${templateId}-version`,
  relationship_stage: "acquaintance",
  current_mood: "calm",
  current_activity: "relaxing",
  current_location_id: "home",
  current_energy: "medium",
  introduced_at: "2026-08-01T12:00:00.000Z",
  contact_added_at: "2026-08-01T12:00:00.000Z",
  met_at: "2026-08-01T12:00:00.000Z",
  last_simulated_at: "2026-08-18T12:00:00.000Z",
  together_character_templates: {
    id: templateId,
    name,
    slug: name.toLocaleLowerCase(),
    age: 27,
    occupation: "Designer",
    biography: "",
  },
  together_character_versions: {
    id: `${templateId}-version`,
    portrait_asset_key: name.toLocaleLowerCase(),
    interests: [],
    personality_config: {},
  },
});

const conversation = (
  id: string,
  characterId: string,
  lastMessageAt: string | null,
  preview: string,
  archivedAt: string | null = null,
): Conversation => ({
  id,
  character_instance_id: characterId,
  kind: "direct",
  title: null,
  last_message_at: lastMessageAt,
  archived_at: archivedAt,
  last_message_preview: preview,
});

describe("message inbox presentation", () => {
  const characters = [
    character("maya", "maya-template", "Maya"),
    character("chloe", "chloe-template", "Chloe"),
  ];
  const conversations = [
    conversation(
      "maya-chat",
      "maya",
      "2026-08-18T12:00:00.000Z",
      "Want to go for a walk?",
    ),
    conversation(
      "chloe-chat",
      "chloe",
      "2026-08-18T13:00:00.000Z",
      "I found that place.",
    ),
    conversation(
      "old-chat",
      "maya",
      "2026-08-17T12:00:00.000Z",
      "Old news",
      "2026-08-17T13:00:00.000Z",
    ),
    {
      ...conversation(
        "deleted-chat",
        "chloe",
        "2026-08-18T14:00:00.000Z",
        "Should stay hidden",
      ),
      user_archived_at: "2026-08-18T14:05:00.000Z",
      restore_until: "2026-09-17T14:05:00.000Z",
    },
  ];

  it("targets the native tab navigator when leaving a conversation", () => {
    expect(MESSAGES_INBOX_HREF).toBe("/chat-tab?inbox=1");
    expect(MESSAGES_INBOX_ROUTE).toBe("/(tabs)/chat-tab?inbox=1");
  });

  it("explicitly targets the nested Messages tab from root-stack conversations", () => {
    const navigated: string[] = [], order: string[] = [];
    returnToMessagesInbox({
      reset: (href) => order.push(`reset:${href}`),
      navigate: (href) => { navigated.push(href); order.push(`navigate:${href}`); },
      schedule: (action) => { order.push('scheduled'); action(); },
    });
    expect(navigated).toEqual([MESSAGES_INBOX_HREF]);
    expect(order).toEqual(['reset:/home', 'scheduled', `navigate:${MESSAGES_INBOX_HREF}`]);
  });

  it("shows active chats newest-first and excludes archived transcripts", () => {
    expect(
      buildInboxRows(conversations, characters, [], "", "all").map((row) =>
        row.conversation.id
      ),
    ).toEqual(["chloe-chat", "maya-chat"]);
  });

  it("keeps a clearly identified group row visible while roster details load", () => {
    const group = {
      ...conversation(
        "group-chat",
        "maya",
        "2026-08-18T15:00:00.000Z",
        "Hello group",
      ),
      kind: "group",
      title: "Maya & Chloe",
    };
    const row = buildInboxRows([...conversations, group], characters, [], "", "all").find((item) => item.conversation.id === "group-chat");
    expect(row?.conversation.kind).toBe("group");
    expect(row?.group).toBeUndefined();
  });

  it("gives hydrated group conversations their own inbox filter", () => {
    const group = {
      ...conversation(
        "group-chat",
        "maya",
        "2026-08-18T15:00:00.000Z",
        "Hello group",
      ),
      kind: "group",
      title: "Maya & Chloe",
    };
    const detail = {
      conversation: group,
      participants: characters.map((item, index) => ({
        id: `participant-${index}`,
        character_instance_id: item.id,
        together_character_instances: item,
      })),
      messages: [],
      reactions: [],
      generatedMedia: [],
      mediaOffers: [],
      settings: { responseMode: "automatic", energy: "balanced" },
    } as unknown as GroupDetail;
    expect(
      buildInboxRows([...conversations, group], characters, [], "", "groups", [
        detail,
      ]).map((row) => row.conversation.id),
    ).toEqual(["group-chat"]);
    expect(
      buildInboxRows([...conversations, group], characters, [], "", "all", [
        detail,
      ]).map((row) => row.conversation.id)[0],
    ).toBe("group-chat");
  });

  it("lets an explicit group favorite override member favorites", () => {
    const baseGroup = {
        ...conversation(
          "group-chat",
          "maya",
          "2026-08-18T15:00:00.000Z",
          "Hello group",
        ),
        kind: "group",
        title: "Maya & Chloe",
      },
      detail = {
        conversation: baseGroup,
        participants: characters.map((item, index) => ({
          id: `participant-${index}`,
          character_instance_id: item.id,
          together_character_instances: item,
        })),
        messages: [],
        reactions: [],
        generatedMedia: [],
        mediaOffers: [],
        settings: { responseMode: "automatic", energy: "balanced" },
      } as unknown as GroupDetail;
    const favorited = {
        ...baseGroup,
        metadata: { favorite: true },
      },
      notFavorited = {
        ...baseGroup,
        metadata: { favorite: false },
      };
    expect(buildInboxRows(
      [favorited],
      characters,
      [],
      "",
      "favorites",
      [{ ...detail, conversation: favorited }],
    )).toHaveLength(1);
    expect(buildInboxRows(
      [notFavorited],
      characters,
      ["maya-template"],
      "",
      "favorites",
      [{ ...detail, conversation: notFavorited }],
    )).toHaveLength(0);
  });

  it("filters favorites and searches names or previews", () => {
    expect(
      buildInboxRows(
        conversations,
        characters,
        ["maya-template"],
        "",
        "favorites",
      ).map((row) => row.character.id),
    ).toEqual(["maya"]);
    expect(
      buildInboxRows(conversations, characters, [], "found", "all").map((row) =>
        row.character.id
      ),
    ).toEqual(["chloe"]);
    expect(
      buildInboxRows(conversations, characters, [], "MAYA", "all").map((row) =>
        row.character.id
      ),
    ).toEqual(["maya"]);
    expect(
      buildInboxRows(
        conversations.map((item) => ({ ...item, unread: item.id === "maya-chat" })),
        characters,
        [],
        "",
        "unread",
      ).map((row) => row.conversation.id),
    ).toEqual(["maya-chat"]);
  });

  it("formats compact timestamps and safe empty previews", () => {
    expect(
      formatInboxTimestamp(
        "2026-08-16T12:00:00.000Z",
        new Date("2026-08-18T14:00:00.000Z"),
      ),
    ).toBe("2d");
    expect(formatInboxTimestamp(null)).toBe("");
    expect(inboxPreview(conversation("empty", "maya", null, "   "))).toBe(
      "Start the conversation.",
    );
    expect(
      inboxPreview(
        conversation("hydrating", "maya", "2026-08-18T12:00:00.000Z", ""),
      ),
    ).toBe("Continue the conversation.");
    expect(inboxPreview({
      ...conversation("outgoing", "maya", "2026-08-18T12:00:00.000Z", "See you soon"),
      last_message_role: "user",
    })).toBe("You: See you soon");
    expect(inboxPreview({
      ...conversation("photo", "maya", "2026-08-18T12:00:00.000Z", "What do you think?"),
      last_message_role: "user",
      last_message_attachment_kind: "image",
    })).toBe("You: Photo · What do you think?");
    expect(inboxPreview({
      ...conversation("generated-photo", "maya", "2026-08-18T12:00:00.000Z", "[Photo]"),
      last_message_role: "assistant",
    })).toBe("Photo");
    expect(inboxPreview({
      ...conversation("pending", "maya", "2026-08-18T12:00:00.000Z", "Hello"),
      reply_pending: true,
    })).toBe("Generating a response…");
    expect(inboxPreview(
      conversation("draft", "maya", "2026-08-18T12:00:00.000Z", "Hello"),
      { draft: "  Finish\nthis  " },
    )).toBe("Draft: Finish this");
  });

  it("preserves a hydrated preview across a broader snapshot refresh", () => {
    const canonical = conversation(
      "maya-chat",
      "maya",
      "2026-08-18T12:00:00.000Z",
      "",
    );
    const hydrated = conversation(
      "maya-chat",
      "maya",
      "2026-08-18T12:00:00.000Z",
      "Still here.",
    );
    expect(
      mergeInboxConversations([canonical], [hydrated])[0]?.last_message_preview,
    ).toBe("Still here.");
    const newer = { ...canonical, last_message_at: "2026-08-18T12:01:00.000Z" };
    expect(
      mergeInboxConversations([newer], [hydrated])[0]?.last_message_preview,
    ).toBe("");
  });

  it("updates a conversation preview from a local canonical message", () => {
    const message: Message = {
      id: "message",
      conversation_id: "maya-chat",
      role: "assistant",
      content: "  See you\nsoon. ",
      delivery_status: "complete",
      created_at: "2026-08-18T12:02:00.000Z",
    };
    expect(
      conversationWithLastMessage(
        conversation("maya-chat", "maya", null, ""),
        message,
      ),
    ).toMatchObject({
      last_message_at: message.created_at,
      last_message_preview: "See you soon.",
      last_message_role: "assistant",
    });
  });

  it("forwards existing chat intents while leaving a plain tab visit in the inbox", () => {
    expect(chatHrefFromInboxParams({})).toBeNull();
    expect(chatHrefFromInboxParams({
      inbox: "1",
      character: "maya",
      plan: "1",
    })).toBeNull();
    expect(
      chatHrefFromInboxParams({
        character: "maya",
        plan: "1",
        draft: "Meet me at Juniper Café?",
      }),
    )
      .toBe(
        "/chat?character=maya&plan=1&draft=Meet%20me%20at%20Juniper%20Caf%C3%A9%3F",
      );
    expect(chatHrefFromInboxParams({
      character: "maya-instance",
      plan: "1",
      location: "juniper-cafe",
      world: "juniper-city",
      activity: "late_night_coffee",
      draft: "Want to go?",
      switchPlanId: "active-plan",
    })).toBe(
      "/chat?character=maya-instance&plan=1&draft=Want%20to%20go%3F&location=juniper-cafe&world=juniper-city&activity=late_night_coffee&switchPlanId=active-plan",
    );
  });

  it('opens the latest direct or group chat from discovery tabs',()=>{
    const maya=character('maya-instance','maya-template','Maya');
    const direct=conversation('maya-chat','maya-instance','2026-08-25T10:00:00.000Z','Hi');
    const group={...conversation('friends-chat','maya-instance','2026-08-25T11:00:00.000Z','Later'),kind:'group'};
    expect(mostRecentChatHref([direct,group],[maya])).toBe('/group-chat?id=friends-chat');
    expect(mostRecentChatHref([direct],[maya])).toBe('/chat?character=maya');
    expect(mostRecentChatHref([],[])).toBeNull();
    expect(['/home','/(tabs)/explore','/moments/'].every(shouldOpenMostRecentChat)).toBe(true);
    expect(shouldOpenMostRecentChat('/profile')).toBe(false);
  });

  it("gives a place planner a fresh session even when it reuses the current conversation", () => {
    const ordinary = chatSessionRouteKey("becka-chat", {
      character: "becka-shaw",
    });
    const riverwalk = chatSessionRouteKey("becka-chat", {
      character: "becka-shaw",
      plan: "1",
      world: "juniper-city",
      location: "riverwalk",
    });
    const park = chatSessionRouteKey("becka-chat", {
      character: "becka-shaw",
      plan: "1",
      world: "juniper-city",
      location: "halcyon-park",
    });
    const switching = chatSessionRouteKey("becka-chat", {
      character: "becka-shaw",
      plan: "1",
      world: "juniper-city",
      location: "halcyon-park",
      switchPlanId: "active-plan",
    });
    expect(riverwalk).not.toBe(ordinary);
    expect(park).not.toBe(riverwalk);
    expect(switching).not.toBe(park);
    expect(
      chatSessionRouteKey("becka-chat", { character: "different-route-key" }),
    ).toBe(ordinary);
  });

  it("keeps pinned conversations above newer unpinned conversations", () => {
    const maya = character("maya-instance", "maya-template", "Maya");
    const chloe = character("chloe-instance", "chloe-template", "Chloe");
    const pinned = {
      ...conversation("maya-chat", maya.id, "2026-08-20T10:00:00.000Z", "Earlier"),
      metadata: { pinned: true },
    };
    const newer = conversation("chloe-chat", chloe.id, "2026-08-30T10:00:00.000Z", "Newer");
    const rows = buildInboxRows([newer, pinned], [maya, chloe], [], "", "all");
    expect(rows.map((row) => row.conversation.id)).toEqual(["maya-chat", "chloe-chat"]);
    expect(isConversationPinned(pinned)).toBe(true);
    expect(buildInboxSections(rows).map((section) => ({ title: section.title, ids: section.data.map((row) => row.conversation.id) }))).toEqual([
      { title: "Pinned", ids: ["maya-chat"] },
      { title: "Recent", ids: ["chloe-chat"] },
    ]);
  });

  it("merges paginated conversations and group rosters without duplicates", () => {
    const maya = conversation("maya-chat", "maya", "2026-08-20T10:00:00.000Z", "Earlier");
    const updatedMaya = { ...maya, last_message_preview: "Updated" };
    const chloe = conversation("chloe-chat", "chloe", "2026-08-20T11:00:00.000Z", "Later");
    expect(mergeInboxPages([maya], [updatedMaya, chloe])).toEqual([updatedMaya, chloe]);
    const first = { conversation: maya, participants: [] };
    const updated = { conversation: updatedMaya, participants: [] };
    expect(mergeInboxGroups([first], [updated])).toEqual([updated]);
  });
});
