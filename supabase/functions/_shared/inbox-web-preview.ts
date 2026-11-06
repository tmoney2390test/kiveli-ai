type Row = Record<string, unknown>;

/** Keep restricted content out of a safe inbox without misidentifying the latest speaker. */
export function restrictedInboxPreview(conversation: Row, message: Row | undefined): Row {
  if (!message || String(message.conversation_id) !== String(conversation.id) ||
    String(message.created_at) !== String(conversation.last_message_at)) return conversation;
  if (message.visibility_scope === 'all' && ['safe', 'suggestive'].includes(String(message.content_rating))) return conversation;
  return {
    ...conversation,
    last_message_preview: 'Messages unavailable in this app',
    last_message_role: message.role,
    last_message_delivery_status: message.delivery_status,
    last_message_attachment_kind: null,
  };
}

/** Override the safe inbox preview only for an authorized website request. */
export function webAdultInboxPreview(conversation: Row, message: Row | undefined, authorizedWebAdult: boolean): Row {
  if (!authorizedWebAdult || !message || String(message.conversation_id) !== String(conversation.id) ||
    String(message.created_at) !== String(conversation.last_message_at)) return conversation;
  const content = String(message.content ?? '').replace(/\s+/gu, ' ').trim().slice(0, 500);
  const attachments = Array.isArray(message.together_conversation_attachments) ? message.together_conversation_attachments as Row[] : [];
  const attachmentKind = attachments.map((item: Row) => String(item?.kind ?? '')).find((kind: string) => ['image', 'audio', 'video'].includes(kind)) ?? null;
  return {
    ...conversation,
    last_message_preview: content || (attachmentKind === 'image' ? '[Photo]' : null),
    last_message_role: message.role,
    last_message_delivery_status: message.delivery_status,
    last_message_attachment_kind: attachmentKind,
  };
}
