# Retention implementation and release — 16 September 2026

## Shipped

28 service-only retention policies, hourly bounded database cleanup, a separate hourly private-file reference audit, preservation holds, per-policy status/counters and 30-day run history. A transaction advisory lock prevents overlapping database cleanup. Least-recently-run ordering prevents large backlogs from starving later policies. Each policy rolls its changes and aggregates back together on error; errors expose SQLSTATE rather than private row contents.

Rules cover expired access grants/caches, successful and failed cron history, performance/engagement/AI telemetry, completed storage/export records, delivered email payloads, settled context manifests, processed media-webhook metadata, routine schedule history, client/Ops diagnostics, resolved support content, archived message/rewrite/transcript copies and expired reporting aggregates.

Raw telemetry is summarized atomically as it is removed. Daily model/tier costs, tokens, event counts and mergeable latency buckets remain for 13 months. Daily account activity preserves distinct-user calculations and cascades on account deletion. Live recent Ops reports continue using their existing raw-data windows; the retention panel identifies summarized historical data separately. Buckets are not represented as exact historical percentiles.

Archived chat content is **minimized**, not a cascading conversation deletion: message IDs and context-charge evidence remain, along with independent memory summaries, episode summaries, scenario records, relationship history and saved generated media. Eligible old rewrite and call-transcript copies are also minimized. An active investigation, reserved context hold or unfinished dialogue can block relevant cleanup. This intentionally does not promise deletion of every record related to an archived conversation.

Private orphan scanning is limited to `together-user-media`. It checks public application records, including nested JSON and legacy records, conservatively retaining any matching path. A first unreferenced observation starts a seven-day minimum quarantine. An eligible object is queued through existing storage cleanup, and references/holds are checked again immediately before Storage API removal. Referenced catalogue/character/world buckets are not age-purged. One object is inspected per hourly audit to bound the expensive unknown-reference scan; large inventories take multiple cycles. Ops shows audit states and bytes, with deleted-file audit records kept 30 days.

Existing storage cleanup now filters held/ineligible jobs before its limit, reports query/completion failures and includes export expirations in its metrics. Unattached uploads are deleted conditionally in the database first; the trigger queues file deletion only when the row is still unattached. This avoids deleting the file while a message is concurrently claiming it.

Ops Overview includes an expandable Data retention panel: enabled/paused policies, retention descriptions, last success/error, last-batch counts, lifetime counters, history summaries and file-audit state. Batch counts are explicitly not a complete backlog estimate. The privacy page describes implemented periods and exceptions.

## Production results

First committed cleanup batch:

| Class | Removed |
|---|---:|
| Expired media-access grants | 1,000 |
| Expired suggestion-cache rows | 3 |
| Old successful cron runs | 1,000 |
| Unreferenced past routine schedule blocks | 53 |
| Total | 2,056 |

The 1,000 removed cron records are represented in daily aggregates. Remaining backlog is drained by scheduled 500-row batches per policy, rather than a large blocking delete. No immediate disk-size reduction is claimed.

Post-cleanup production snapshot: 2,421 messages, 3,209 storage objects and seven still-restorable archived chats remained. No archived chats had naturally expired. All policy error fields were clear. The first private-file audit checked one object and queued none; no object was removed by the new orphan process during this release.

## Verification

- PGlite tests execute all five new migrations and check policy SQL, dry run, pause/hold behavior, expiry windows, bounded batches, replay-safe rollups, account-cascade behavior, cost totals, preserved quote accounting, active jobs, archive minimization, error isolation and service-only permissions.
- Private-file tests cover referenced files, quarantine, nested JSON references and a reference added after queueing but before removal.
- Existing context-pricing database tests passed, including reservation/refund idempotency and bucket provenance.
- A rollback-only production check exercised real message triggers while temporarily expiring an archived conversation: 41 message bodies were processed without SQL errors, then the transaction was rolled back. Those messages were not permanently changed by the check.
- App TypeScript check, focused Edge Function checks and all 908 app tests passed.
- Production security advisors show only expected informational RLS-without-client-policy findings for new service-only tables. No client read/execute grants were added.
- Expo web export, production auth-bundle validation, Cloudflare dry run and live 423-page/63-asset route audit passed. `/ops` and `/privacy-policy` returned 200; the published privacy HTML contains the new retention wording. No authenticated visual Ops walkthrough or physical-device run is claimed.

## Deployment

- Database migrations: `20260916174640_data_retention`, `20260916175712_retention_storage_and_archive`, `20260916180159_retention_storage_scan_budget`, `20260916180350_retention_activation_and_fairness`, `20260916180702_retention_transcript_and_audit_health`.
- All 28 policies enabled after production dry runs. The last transcript policy is enabled operationally after its migration's dry run; fresh environments must perform the same review/activation step.
- `together-life-dispatch` v178 and `together-ops` v112. Existing live bundles were preserved, overlaying only the changed entrypoint/dashboard module; custom authentication was preserved.
- Web Worker version `b98221e9-2700-4bab-a05c-0acb3511fbdd`.
- Shared bundle `86a149a2205d18050ebec6c37c9f511d`.
- No native binaries built.

## Deliberate exclusions and remaining external work

- **Legacy tables were not deleted.** Live SQL dependencies include `search_jukestr_projection`, `refresh_search_document` and four normalization/synchronization functions. Their external consumers have not been established. The 344 MB identified in the audit is not safe to blanket-purge.
- **Credit ledger, purchase/subscription/grant IDs and deletion markers remain.** They protect balances, refunds, monthly allocations and replay suppression. A longer-term financial archive period needs a business/accounting decision; no arbitrary TTL was introduced.
- **Unfinished companion drafts are retained.** The audit proposed considering a 60-day reminder/90-day deletion after product notice, not immediate removal. No user notice or draft deletion was silently introduced.
- **Compact media quality/routing flags remain.** The inspected provider metadata was already compact diagnostics/cost/route fields rather than stored raw provider responses. Removing these would discard useful Ops evidence without a material size benefit.
- **Provider retention and backup rotation were not changed.** An isolated restore drill, deletion replay after restores and contracts/settings for external AI, billing, email and storage providers still need separate verification. Database backups do not back up the actual Supabase Storage files.
- Support billing/safety cases and unresolved linked incidents are excluded from ordinary support-content expiry. Explicit preservation holds can cover additional records.

## Operating the policy

Use service-role access only. Start with `select public.kivelle_run_retention(true,500);` to inspect bounded candidates. A `batchFull` result means there may be more rows; it is not an exact backlog count. Run a particular reviewed policy with `select public.kivelle_run_retention(false,500,'asset_grants');`.

Pause an individual policy by setting its `enabled=false`. Preservation holds use the policy key plus `record_id='*'` for a policy-wide hold or the applicable record identifier for a targeted hold. Orphan-file holds use the storage path. Give each hold a reason and review date; avoid retaining personal data through forgotten permanent holds.

No runtime RPC accepts a caller-provided relation name or SQL predicate. Changes to the SQL-backed registry require trusted database access and the same migration/review discipline as application code. Do not expose registry writes through client APIs.
