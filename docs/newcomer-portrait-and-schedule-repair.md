# New resident portrait and schedule repair

The October 2026 audit found 180 newly published residents across nine worlds with
locally registered portraits whose 360 display/thumbnail objects had not been
uploaded to the public catalog. Their schedule templates also repeated one
six-block pattern on all seven days, including work at closed venues.

The 360 immutable, content-hashed images were uploaded without replacement and
verified byte for byte from their public URLs. The temporary upload Edge Function
was replaced with a disabled HTTP 410 version. The production portrait audit now
verifies both delivered variants for every published selectable resident. Run
`pnpm portrait:audit -- --verify-delivery` with server-only Supabase credentials
after publishing a character; registry and manifest checks alone are insufficient.

The schedule source is in `content/schedule-repairs/`. Run
`node scripts/repair-newcomer-schedules.mjs --report` to validate seven-day
coverage, venue hours, activity/venue fit, and two days off per resident. Run
`node scripts/repair-newcomer-schedules.mjs --write-sql` to regenerate the nine
idempotent world-specific scripts in `scripts/sql/`. The scripts resolve
published characters and locations by slug, refuse to replace schedules that
have been manually edited outside this repair, and clear only future recurring
materialization for the affected character versions. Plans and overrides remain.

These residents were published directly to the live catalog, outside the checked-in
world seed migrations. The SQL is therefore an explicit repair operation, not a
database migration that would fail in environments where the residents do not
exist yet. Their existing character bibles and adult content are unchanged.
