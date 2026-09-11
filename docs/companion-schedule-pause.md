# Companion schedule pause

## Behavior
Chat settings → Chat has a single Pause schedule / Resume schedule control.
Both directions use the existing web/native confirmation mechanism. The setting
is private to the owned character instance in the current Life, shared by that
instance's conversations rather than changing its public character template.
All tiers may use it. Group chat does not expose a bulk pause.

Pausing records the server-resolved passive routine (not a temporary plan).
Passive schedule generation, routine outcomes, ambient routine messages, and
clock-driven presence stop advancing. Plans, dates, user-led scenes, venue hours,
and commitment conflicts remain active. After a temporary scene ends, the held
routine is still available. Resuming follows the current day; it does not replay
missed routine events. This is not a world-clock, weather, or plan-time freeze.
It never resets conversation history, trust, life/death state, or memories.

The setting is an immediate confirmed action, independent of the general
settings Save button. If another device changes it first, the stale request
receives a conflict and must reload. Duplicate in-flight taps are suppressed.
A response after account/Life switching cannot reinsert the old companion.

## Persistence and authorization
Migration: `20260911212011_companion_schedule_pause.sql`.
Adds nullable `together_character_instances.schedule_pause`; existing rows
remain null and existing RLS/grants remain intact. No backfill changes users.
The service-only, SECURITY INVOKER RPC `kivelle_set_schedule_pause` checks owned
conversation, current Life, instance ownership, confirmation direction, and
expected state while holding the instance row lock. The API accepts no client
activity/location snapshot. The RPC validates and copies only known snapshot
fields and records the server timestamp.

Production preflight (2026-09-11): target `mfysnlghlhxxcwnwpxog`, 53 character
instances, RLS enabled, authenticated table privilege SELECT only, pause column
and migration absent. No historical migration repair is needed.

## Release and rollback
Start from `bad5af1` on `codex/pause-companion-schedule`; publish only this diff.
Merge after required checks. Apply this migration before functions, then deploy
the web export to `kivelli-app-gateway` using the production EAS environment.
No new secrets, paid-provider calls, catalog changes, or native SDK changes.
Existing native versions cannot expose the button; the new control is included
in the next native bundle. The backend recognizes the hold across clients.

Affected transitive function consumers:
`together-activity`, `together-bootstrap`, `together-call`, `together-companion`, `together-conversation`, `together-creator`, `together-date`, `together-debug`, `together-dialogue`, `together-dialogue-quote`, `together-dialogue-suggestion`, `together-group-dialogue`, `together-interaction`, `together-life-dispatch`, `together-media`, `together-multimodal`, `together-ops`, `together-persona`, `together-plan`, `together-relationship`, `together-scene-reaction`, `together-shared-scene`, `together-simulate`, `together-story-dialogue`, `together-wavespeed-webhook`.

Previous Cloudflare version: `d1a55a68-1fa6-4175-b7ff-02a07bdf8ae1`.
Pre-release function versions (all retain their existing verify_jwt=false and
handler-level authentication):
- together-bootstrap: 184
- together-dialogue: 304
- together-date: 146
- together-simulate: 160
- together-debug: 174
- together-activity: 143
- together-life-dispatch: 170
- together-relationship: 152
- together-conversation: 179
- together-media: 254
- together-companion: 156
- together-plan: 147
- together-creator: 153
- together-persona: 139
- together-interaction: 147
- together-scene-reaction: 175
- together-call: 169
- together-multimodal: 156
- together-shared-scene: 129
- together-wavespeed-webhook: 202
- together-dialogue-suggestion: 115
- together-group-dialogue: 160
- together-ops: 102
- together-story-dialogue: 88
- together-dialogue-quote: 24

Rollback the UI independently if needed, leaving the additive column and RPC.
Do not roll schedule-aware functions back while users have active holds unless
the issue requires it: older code ignores the hold. Prefer a forward fix or a
compatible rollback retaining the hold checks. Do not silently clear users'
holds or reset their stories. Preserve prior deployments for source recovery.

## Verification
- 829 app tests and 1,115 domain tests passed.
- 18 gateway/audit tests passed.
- 28 isolated PGlite database checks: ownership/Life isolation, confirmations,
  concurrent state, privilege boundary, idempotent migration, and unrelated-data
  preservation. This is not a full production database integration test.
- 8 focused Deno schedule tests: held routine, no schedule materialization,
  plans/scenes/dates, resume, snapshot overlays, compacted prompt guidance,
  and suppression of queued routine messages without losing plan reminders.
- 19 existing proactive-context/delivery tests passed.
- Lint, app/domain types, all Edge Function typechecks, production web build,
  web asset budget, and Wrangler dry run passed.
- Regression checks are wired into CI and the isolated database workflow.
- No real conversation was paused, no paid generation was run, and no native
  binary or live dialogue-quality test is claimed by these automated checks.

Production application/version and smoke results are recorded in the release
handoff after deployment, not assumed from this pre-release document.
