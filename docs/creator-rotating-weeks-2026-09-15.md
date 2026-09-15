# Companion daily-life editor and rotating weeks

Implemented a compact daily-life editor: routine presets, activity chips, grouped repeated days, popup editing with direct time choices, per-week generated previews, and a smaller portrait summary. Users can duplicate and edit up to three weeks, then remove a week while preserving consecutive numbering. Every week contains 1–28 non-overlapping activities. Venue-hours warnings are advisory; staff may work outside public hours.

Rotation follows calendar weeks starting Monday in the user's experience timezone. Week 1 is anchored to the week the companion is finalized. Templates carry weekIndex, cycleWeeks, and cycleAnchorDate. Existing schedules without rotation metadata repeat weekly. Presence, future context, plan availability, life events, home suggestions, and character schedule displays all filter by the active week. Scenario and paused-schedule precedence is unchanged.

Database migration 20260915175825_creator_rotating_weeks.sql adds a generated week_index and replaces the old unique time-slot key with a key that includes the week. Content-builder conflict targets are updated accordingly. The finalizer patch validates contiguous weeks and per-week overlaps, preserving installed finalizer behavior and permissions. Deploy the migration and affected Edge functions together before publishing the new web client; native clients need a future app build for the new editor.

Validation: app suite 896 existing tests passed, with two added rotation tests also passing; domain suite 1,140 tests passed; 16 creator/schedule-pause Deno tests passed; isolated PGlite tests verified rotation persistence, duplicate-slot uniqueness, gaps, invalid weeks, and overlap rejection; Eos content migration regression passed. TypeScript and production web export passed. No paid generations, production migration, web deployment, or native builds performed in this pass.


## Production deployment

Deployed on 15 September 2026 at the user's request. Cloudflare version: c746dcfa-bb52-4ba6-8f77-f03f6d7ecf4a. Supabase migration version: 20260915175825. Patched 37 deployed Edge bundles with the rotation diff, preserving unrelated live changes and existing authentication settings. Git implementation: 3be7791.

Live verification: creator list returned HTTP 200 under the QA account; three-week finalization and persisted week metadata passed inside a rolled-back transaction. Public/authenticated roles remain unable to call the privileged finalizer directly. New web HTML and creator assets returned HTTP 200 and contain the rotating-week UI. Backend cold-start requests returned their expected authorization failures, except the legacy billing webhook, which reports its existing missing KIVELLE_BILLING_WEBHOOK_SECRET configuration; RevenueCat's webhook authorization check passed. No subscription settings were changed. No native app builds were produced.
