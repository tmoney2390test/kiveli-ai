/** Copy only identifiers into a support draft; never prompts, photos, or tokens. */
export function supportRequestReferences(params: { mediaId?: unknown; conversationId?: unknown }) {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  return { ...(valid(params.mediaId) ? { mediaId: params.mediaId } : {}),
    ...(valid(params.conversationId) ? { conversationId: params.conversationId } : {}) };
}
