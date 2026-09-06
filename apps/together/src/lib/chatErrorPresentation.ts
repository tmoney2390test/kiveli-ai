export type ChatErrorPresentation = {
  title: string;
  message: string;
  retryable: boolean;
};

/** Converts infrastructure-shaped failures into concise, actionable chat copy. */
export function chatErrorPresentation(value: unknown): ChatErrorPresentation {
  const raw = value instanceof Error ? value.message : String(value ?? "").trim();
  if (/supabase_(?:secret|service_role)_key|server configuration is missing/i.test(raw)) {
    return {
      title: "Chat could not connect",
      message: "Kivelle could not prepare this conversation. Your messages are safe—try again in a moment.",
      retryable: true,
    };
  }
  if (/website_session_preparation_failed|session (?:is )?no longer valid|invalid (?:jwt|session)|auth session missing|not authenticated/i.test(raw)) {
    return {
      title: "Sign-in needs attention",
      message: "Your draft is saved. Sign in again, then return to this conversation.",
      retryable: true,
    };
  }
  if (/failed to fetch|network request failed|load failed|offline|connection/i.test(raw)) {
    return {
      title: "Connection interrupted",
      message: "Your draft is saved. Reconnect, then try again.",
      retryable: true,
    };
  }
  if (/too many requests|rate limit|\b429\b/i.test(raw)) {
    return {
      title: "Kivelle is busy",
      message: "Nothing was lost. Give it a moment, then try again.",
      retryable: true,
    };
  }
  if (/timed? out|taking longer|interrupted|stream ended/i.test(raw)) {
    return {
      title: "Reply is taking longer",
      message: "We are checking for the saved reply. If it does not appear, tap retry.",
      retryable: true,
    };
  }
  const technical=/\b(?:internal_error|functionshttperror|edge function|provider error|database error|jwt)\b/i.test(raw)||/\b[A-Z][A-Z0-9_]{5,}\b/.test(raw);
  return {
    title: "Something interrupted this chat",
    message: !raw||technical ? "Nothing was lost. Please try again." : raw,
    retryable: true,
  };
}
