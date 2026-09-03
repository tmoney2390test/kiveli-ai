export type MediaRouteRecovery = {
  id: string;
  state: "loading" | "missing" | "retry";
};

export type MediaRoutePresentation = "ready" | "loading" | "missing" | "retry";

export function resolveMediaRoutePresentation(input: {
  routeId?: string;
  snapshotReady: boolean;
  mediaId?: string;
  recovery: MediaRouteRecovery | null;
}): MediaRoutePresentation {
  if (!input.snapshotReady || !input.routeId) return "loading";
  if (input.mediaId === input.routeId) return "ready";
  if (input.recovery?.id !== input.routeId || input.recovery.state === "loading") return "loading";
  return input.recovery.state;
}

export function mediaRouteFailureState(error: unknown): "missing" | "retry" {
  if (typeof error !== "object" || error === null || !("code" in error)) return "retry";
  return (error as { code?: unknown }).code === "NOT_FOUND" ? "missing" : "retry";
}
