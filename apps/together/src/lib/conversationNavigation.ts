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

export function conversationRouteTarget(href: string): ConversationRouteTarget | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const parsed = new URL(href, "https://kivelli.app");
  if (parsed.pathname === "/chat") {
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

export function isConversationPath(pathname: string): boolean {
  const path = (pathname.split(/[?#]/, 1)[0] ?? "").replace(/\/$/, "") || "/";
  return path === "/chat" || path === "/group-chat";
}

export function shouldShowRouteTransition(previous: string, next: string): boolean {
  return previous !== next && !(isConversationPath(previous) && isConversationPath(next));
}
