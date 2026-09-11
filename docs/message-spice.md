# Message Spice

## Interaction

Tap the latest completed character text reply and choose **Spice**. It creates an
alternative for that same user turn using the existing adult-text provider route.
The old reply stays visible until a validated replacement is committed. The same
menu then offers **Restore original**, with no provider call or credit charge.
Older replies, user messages, media-only messages, dead-character notices, and
unfinished turns are not eligible. Private groups rewrite only the selected
latest speaker; they do not run another group round.

There is no new settings panel or persistent label. The action is exposed only
with recorded adult eligibility and the conversation's existing explicit-text
preference. Backend checks remain authoritative. Native private-text permission
does not authorize explicit visuals or audio. Original voice notes are not shown
beside revised wording; restoring the original restores its voice presentation.

## Contract and safeguards

- Existing dialogue/group endpoints accept messageAction (spice or restore),
  conversationId, anchorMessageId, expectedRevision, and clientRequestId.
  Optional characterInstanceId retains the direct-chat contract.
- Ownership, active continuity, participant adulthood, subscription access for
  groups, conversation boundaries, life state, content policy, and AI permission
  are checked server-side. Eligibility is checked again before commit.
- Existing isolated speaker context is read-only and stops before the target
  reply. Identity, actual source user turn, persona, memories, SMS/paragraph
  preferences, and canonical scene facts are preserved. Revision instructions
  survive prompt compaction.
- This is alternate wording, not another action: no new plan, trust, relationship,
  life-state, memory, media, or proactive-message processing. Previously committed
  story effects are not undone. No conversation reset/archive operation is used.
- Manual routing is recorded separately from actual classification. Existing
  owner-only provider experiments are respected. Strict routing cannot silently
  downgrade to a different provider or deterministic substitute. The manual
  selection does not create a new sticky classification window.
- Existing account concurrency, rolling limits, cost controls, context quotes,
  ledger reservations, and turn leases are reused. At most two provider attempts
  are permitted with a 100-second operation signal. Failures keep the old reply
  and release unused reservations. Moderation and secret-like-output checks stay.
- Quotes bind the anchor revision as well as the context state. A successful
  Spice counts as one daily message on capped plans; failed and restored revisions
  do not. Extended-context credits use the existing authoritative quote and
  receipt calculation, with maximum credits confirmed before submitting.
- A stable client request UUID, service-only revision journal, conversation/turn
  locks, and revision compare-and-swap prevent duplicate replacement/charging.
  A newly appended visible message invalidates the pending revision.
- Realtime/replay reconciliation ignores older revisions. Group delta fetches
  include revised_at. Original text is stored only in the private journal, never
  in public metadata, analytics, or ordinary logs. RLS and privilege revocation
  keep that journal and its RPCs service-only; message/account deletion cascades.

Restore also requires the latest reply and current content eligibility. It is
not a historical branch editor or a way to retrieve restricted original text.
If a connection drops during generation, refresh before retrying: a completed
request is replayed without another provider call, and the same request ID never
creates parallel work.

## Release manifest

Repository baseline: 992e67fb84f005a6d7f776dce3f5f3b1b4a3714c.
Branch: codex/message-spice. Record the merged release commit and production
versions in the release handoff; this file alone is not deployment evidence.

Production: Supabase mfysnlghlhxxcwnwpxog; Cloudflare kivelli-app-gateway at
https://kivelli.app. No new secrets, provider models, prices, or rollout flags.
Use the existing authenticated production environment.

Order:

1. Required GitHub checks and merge.
2. Apply only 20260911170800_message_spice_revisions.sql through the migration
   mechanism. Do not repair or apply unrelated historical migrations.
3. Deploy together-dialogue, together-group-dialogue, together-dialogue-quote,
   and together-group, then the snapshot consumers together-bootstrap,
   together-companion, together-persona, together-relationship, together-debug.
   Preserve each function's existing authentication configuration.
4. Build with EAS production environment and deploy the gateway's static assets.
5. Verify schema permissions, function versions/authentication, route health, and
   published JS hashes. Native UI changes ship with the next native build.

Other shared prompt consumers (call, story, scene reaction) do not supply the new
revision context/options; their normal behavior is unchanged. The conversation
endpoint already returns full message rows, so no redeployment is needed there.

The migration adds a private journal and revised_at index and expands the context
receipt primary key from message_id to (message_id, reply_key), preserving
existing receipt rows. It adds a guarded update trigger for new quote receipts.
Rollback code and gateway to the previous release if necessary; keep the journal,
receipts, revised messages, and additive schema. Do not discard user revisions
or rewrite billing history as a rollback. Verify backup availability separately;
no backup restore or real user-data mutation is claimed here.

## Verification

- App/domain/gateway/audit tests: 1,943 passing.
- Eight mocked Deno tests: manual routing, strict no-fallback failure, age,
  ownership, stale targets, native text scope, quote binding, SMS/paragraph
  compaction. Fixtures are neutral and provider calls are mocked.
- 38 isolated PGlite checks apply the actual migration and context receipt
  functions: ownership/leases/CAS, duplicate attempts, save/restore, original
  recovery, credits and refunds, failed attempts, daily caps, expiry, RLS/ACLs,
  and cascade cleanup. These are not a full Supabase integration test.
- Typecheck, lint, all configured Edge Function checks, production web build, and
  relevant GitHub database/native-config gates are required before release.

No paid generations or private user conversation mutations are used for release
verification. Mocked routing correctness does not establish live reply quality.
