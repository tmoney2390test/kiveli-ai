import type { Snapshot } from "../types";
import {
  mostRecentlyMessagedConversation,
  mostRecentlyUsedConversation,
} from "./conversation";
import { characterResidentWorld } from "./place";

export function recentCompanionDiscoveryHref(snapshot: Snapshot): string {
  const characterIds = new Set(snapshot.characters.map((character) => character.id));
  const conversations = snapshot.conversations.filter((conversation) =>
    characterIds.has(conversation.character_instance_id)
  );
  const conversation = mostRecentlyMessagedConversation(conversations) ??
    mostRecentlyUsedConversation(conversations);
  const character = conversation
    ? snapshot.characters.find((item) =>
      item.id === conversation.character_instance_id
    )
    : undefined;
  const world = characterResidentWorld(snapshot, character);
  return world
    ? `/(tabs)/singles?world=${encodeURIComponent(world.slug)}`
    : "/(tabs)/singles";
}
