/** Copy only identifiers into a support draft; never prompts, photos, or tokens. */
export function supportRequestReferences(
  params: {
    mediaId?: unknown;
    conversationId?: unknown;
    messageId?: unknown;
    correlationId?: unknown;
    errorCode?: unknown;
    purchaseReference?: unknown;
  },
) {
  const valid = (value: unknown): value is string =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  return {
    ...(valid(params.mediaId) ? { mediaId: params.mediaId } : {}),
    ...(valid(params.conversationId) ? { conversationId: params.conversationId } : {}),
    ...(valid(params.messageId) && valid(params.conversationId)
      ? { messageId: params.messageId }
      : {}),
    ...(typeof params.correlationId === 'string' &&
        /^[a-zA-Z0-9:_-]{1,128}$/.test(params.correlationId)
      ? { correlationId: params.correlationId }
      : {}),
    ...(typeof params.errorCode === 'string' && /^[A-Z0-9_:-]{1,100}$/.test(params.errorCode)
      ? { errorCode: params.errorCode }
      : {}),
    ...(typeof params.purchaseReference === 'string' &&
        /^[a-zA-Z0-9._:-]{1,120}$/.test(params.purchaseReference)
      ? { purchaseReference: params.purchaseReference }
      : {}),
  };
}
export function contextualSupportHref(
  topic: 'conversation' | 'media' | 'purchase',
  references: Parameters<typeof supportRequestReferences>[0] = {},
  error?: unknown,
) {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; correlationId?: unknown }
    : {};
  const params = new URLSearchParams({
    mode: 'new',
    topic,
    ...supportRequestReferences({
      ...references,
      errorCode: details.code ?? references.errorCode,
      correlationId: details.correlationId ?? references.correlationId,
    }),
  });
  return `/support?${params.toString()}`;
}
