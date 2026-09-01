import { appRouteHref } from "./appNavigation";

export { navigateLocalRouteOnWeb } from "./appNavigation";

export type ConversationRouteTarget =
  | { pathname: "/chat"; params: { character: string } }
  | { pathname: "/group-chat"; params: Record<string, string> };

export function directConversationTarget(character: string): ConversationRouteTarget {
  return { pathname: "/chat", params: { character } };
}

export function groupConversationTarget(
  id: string,
  options: { settings?: boolean } = {},
): ConversationRouteTarget {
  return {
    pathname: "/group-chat",
    params: options.settings ? { id, settings: "1" } : { id },
  };
}

export function groupConversationWebHref(
  id: string,
  options: { settings?: boolean } = {},
): string {
  const params = new URLSearchParams({ group: "1", id });
  if (options.settings) params.set("settings", "1");
  return `/chat?${params.toString()}`;
}

export function conversationRouteTarget(href: string): ConversationRouteTarget | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const parsed = new URL(href, "https://kivelli.app");
  if (parsed.pathname === "/chat") {
    const groupId = parsed.searchParams.get("group") === "1"
      ? parsed.searchParams.get("id")?.trim()
      : undefined;
    if (groupId) {
      return groupConversationTarget(groupId, {
        settings: parsed.searchParams.get("settings") === "1",
      });
    }
    const character = parsed.searchParams.get("character")?.trim();
    return character ? directConversationTarget(character) : null;
  }
  if (parsed.pathname === "/group-chat") {
    const id = parsed.searchParams.get("id")?.trim();
    if (!id) return null;
    return groupConversationTarget(id, {
      settings: parsed.searchParams.get("settings") === "1",
    });
  }
  return null;
}

export function webConversationHref(href: string): string | null {
  const target = conversationRouteTarget(href);
  if (!target) return null;
  if (target.pathname === "/group-chat") {
    return groupConversationWebHref(target.params.id ?? "", {
      settings: target.params.settings === "1",
    });
  }
  return localRouteHref(href);
}

export function localRouteHref(href: string): string | null {
  return appRouteHref(href);
}

export function conversationReturnHref(href?: string | null): string | null {
  if (!href) return null;
  const local = localRouteHref(href);
  if (!local || !isConversationPath(local)) return null;
  return local;
}

export function mediaViewerHref(mediaId: string, returnTo?: string | null): string {
  const path = `/media/${encodeURIComponent(mediaId)}`;
  const conversation = conversationReturnHref(returnTo);
  if (!conversation) return path;
  return `${path}?${new URLSearchParams({ returnTo: conversation }).toString()}`;
}

export function isConversationPath(pathname: string): boolean {
  const path = (pathname.split(/[?#]/, 1)[0] ?? "").replace(/\/$/, "") || "/";
  return path === "/chat" || path === "/group-chat";
}

export function shouldShowRouteTransition(previous: string, next: string): boolean {
  return previous !== next && !(isConversationPath(previous) && isConversationPath(next));
}
