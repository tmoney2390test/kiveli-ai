import { describe, expect, it } from "vitest";
import {
  conversationRouteTarget,
  directConversationTarget,
  groupConversationTarget,
  groupConversationWebHref,
  isConversationPath,
  localRouteHref,
  shouldShowRouteTransition,
  webConversationHref,
} from "./conversationNavigation";

describe("conversation navigation", () => {
  it("builds direct and group route objects without string navigation", () => {
    expect(directConversationTarget("iris-vale")).toEqual({
      pathname: "/chat",
      params: { character: "iris-vale" },
    });
    expect(groupConversationTarget("group-1", { settings: true })).toEqual({
      pathname: "/group-chat",
      params: { id: "group-1", settings: "1" },
    });
    expect(groupConversationWebHref("group 1", { settings: true })).toBe(
      "/chat?group=1&id=group+1&settings=1",
    );
  });

  it("recognizes conversation hrefs and decodes their parameters", () => {
    expect(conversationRouteTarget("/chat?character=iris%20vale")).toEqual({
      pathname: "/chat",
      params: { character: "iris vale" },
    });
    expect(conversationRouteTarget("/group-chat?id=group-1&settings=1")).toEqual({
      pathname: "/group-chat",
      params: { id: "group-1", settings: "1" },
    });
    expect(conversationRouteTarget("/chat?group=1&id=group-1")).toEqual({
      pathname: "/group-chat",
      params: { id: "group-1" },
    });
    expect(webConversationHref("/group-chat?id=group-1&settings=1")).toBe(
      "/chat?group=1&id=group-1&settings=1",
    );
    expect(conversationRouteTarget("/home")).toBeNull();
    expect(conversationRouteTarget("https://example.com/chat?character=iris")).toBeNull();
  });

  it("suppresses the global veil only while switching conversations", () => {
    expect(isConversationPath("/chat?character=iris")).toBe(true);
    expect(isConversationPath("/group-chat/")).toBe(true);
    expect(shouldShowRouteTransition("/group-chat", "/chat")).toBe(false);
    expect(shouldShowRouteTransition("/chat", "/home")).toBe(true);
  });

  it("accepts only same-origin route hrefs for browser history navigation", () => {
    expect(localRouteHref("/group-chat?id=group%201#composer")).toBe(
      "/group-chat?id=group%201#composer",
    );
    expect(localRouteHref("//example.com/chat")).toBeNull();
    expect(localRouteHref("https://example.com/chat")).toBeNull();
  });

  it.each([
    "/character/iris-vale",
    "/memories?character=iris-vale",
    "/conversations/instance-1",
    "/conversation-controls?character=instance-1",
    "/subscription?intent=voice",
    "/media/media-1",
    "/plan/plan-1",
    "/world/places?world=eos-meridian&planning=1",
    "/chat-tab?messages=1",
  ])("keeps chat menu destination %s on the local app origin", (href) => {
    expect(localRouteHref(href)).toBe(href);
  });
});
