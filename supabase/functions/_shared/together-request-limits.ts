export type RequestRateLimit = { limit: number; windowSeconds: number };

const ONE_HOUR = 60 * 60;

/**
 * Conversation reads are normal navigation traffic and may be shared across
 * several browser tabs and devices. Keep them protected from abusive polling
 * without making ordinary chat switching consume the mutation budget.
 */
export function conversationActionRateLimit(action: string): RequestRateLimit {
  switch (action) {
    case 'messages':
    case 'read':
      return { limit: 1200, windowSeconds: ONE_HOUR };
    case 'inbox':
    case 'inbox_v2':
      return { limit: 600, windowSeconds: ONE_HOUR };
    case 'history':
    case 'archived':
    case 'search':
    case 'reset_preview':
      return { limit: 240, windowSeconds: ONE_HOUR };
    case 'ensure':
    case 'open':
    case 'message_favorite':
    case 'pin':
    case 'settings':
      return { limit: 240, windowSeconds: ONE_HOUR };
    default:
      return { limit: 60, windowSeconds: ONE_HOUR };
  }
}

export function simulationRequestRateLimit(): RequestRateLimit {
  return { limit: 240, windowSeconds: ONE_HOUR };
}
