# Explicit fresh chats

Normal open/ensure/reconnect calls reuse the active transcript. The legacy
`kivelle_start_conversation` RPC is now an atomic ensure, including for old
deployed callers. It cannot archive a conversation. Locks are acquired before
checking for an existing transcript, so concurrent opens do not replace it.

A new transcript requires the chat menu → Start a fresh chat → type `NEW CHAT`
→ Start fresh chat. The message-action shortcut was removed. Cancel, backdrop,
Escape/back and closing the dialog before submission do not send a new request.
An accepted in-flight operation cannot be cancelled by dismissing its dialog.

The server requires `confirmation: start_fresh_chat`, an expected conversation
ID, and a stable request UUID. The service-only fresh-chat RPC locks and verifies
the exact active transcript before archiving it. An active dialogue turn blocks
the change. Replays return the same result, and stale/different requests cannot
replace the new transcript. Confirmation is a deliberate UI/API contract, not
proof that a human used the UI; database ownership is always enforced separately.

Messages, media, memories, relationship and life state are preserved. Only the
confirmed old transcript is archived. Chat preferences carry forward. Old
transcript queued notifications are retired as before. Replacement metadata
records request ID, previous conversation ID and confirmation time. The existing
sanitized `conversation_started` event now identifies confirmed fresh-chat use.

## Release

Apply only `20260911161232_explicit_fresh_chat.sql`, deploy `together-conversation`,
then publish the web client. No historical migration repair or data restoration
is needed. Existing native clients safely lose the ability to start a fresh chat
until rebuilt; normal chat opening continues. They receive guidance to confirm
from the updated chat menu. No new native build is included in this patch.

Keep the safe database ensure behavior on rollback. Do not restore the previous
archive-on-open RPC. Roll back UI/function code only if necessary; older fresh-chat
requests either fail confirmation or return the existing conversation safely.
Do not automatically unarchive or delete any user's chats as part of release.

## Verification

`node scripts/test-fresh-chat-db.mjs` exercises the real migration in isolated
PGlite: reuse, replay, stale intent, busy turn, ownership, privileges, historical
data preservation and repeat application. Its serialized request tests do not
simulate a multi-process production load. Client and Edge Function tests cover
confirmation, request identity, removed shortcuts and structured conflicts.
