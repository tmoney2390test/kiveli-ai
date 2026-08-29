import { describe, expect, it } from "vitest";
import type { Snapshot } from "../types";
import { recentCompanionDiscoveryHref } from "./companionDiscovery";

const snapshot = {
  worlds: [
    { id: "juniper", slug: "juniper-city", name: "Juniper City" },
    { id: "vervelle", slug: "port-vervelle", name: "Port Vervelle" },
  ],
  characters: [
    {
      id: "brooke",
      character_version_id: "brooke-version",
      together_character_templates: { slug: "brooke" },
    },
    {
      id: "chloe",
      character_version_id: "chloe-version",
      together_character_templates: { slug: "chloe" },
    },
  ],
  characterWorldPresence: [
    {
      id: "brooke-presence",
      character_version_id: "brooke-version",
      world_id: "juniper",
      presence_type: "resident",
    },
    {
      id: "chloe-presence",
      character_version_id: "chloe-version",
      world_id: "vervelle",
      presence_type: "resident",
    },
  ],
  discoverableCharacters: [],
  conversations: [
    {
      id: "brooke-chat",
      character_instance_id: "brooke",
      kind: "direct",
      last_message_at: "2026-08-26T12:00:00.000Z",
    },
    {
      id: "chloe-chat",
      character_instance_id: "chloe",
      kind: "direct",
      last_message_at: "2026-08-26T13:00:00.000Z",
    },
    {
      id: "newer-group",
      character_instance_id: "brooke",
      kind: "group",
      last_message_at: "2026-08-26T14:00:00.000Z",
    },
  ],
} as unknown as Snapshot;

describe("recent companion discovery destination", () => {
  it("opens the world of the most recently messaged individual companion", () => {
    expect(recentCompanionDiscoveryHref(snapshot)).toBe(
      "/(tabs)/singles?world=port-vervelle",
    );
  });

  it("ignores a newer group conversation", () => {
    const groupOnlyNewer = {
      ...snapshot,
      conversations: snapshot.conversations.filter((conversation) =>
        conversation.id !== "chloe-chat"
      ),
    } as Snapshot;
    expect(recentCompanionDiscoveryHref(groupOnlyNewer)).toBe(
      "/(tabs)/singles?world=juniper-city",
    );
  });

  it("falls back to unfiltered Discover without direct-chat history", () => {
    expect(recentCompanionDiscoveryHref({
      ...snapshot,
      conversations: [],
    } as Snapshot)).toBe("/(tabs)/singles");
  });
});
