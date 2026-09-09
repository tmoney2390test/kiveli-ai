// PostgREST sees a second conversations-to-messages path through the reply
// suggestion cache. Pin count embeds to the canonical direct foreign key so a
// new auxiliary join table cannot make conversation snapshots ambiguous.
export const CONVERSATION_WITH_MESSAGE_COUNT_SELECT='*,together_messages!together_messages_conversation_id_fkey(count)';
