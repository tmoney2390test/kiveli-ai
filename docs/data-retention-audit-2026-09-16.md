# Kivelli data retention review

Date: 16 September 2026. Read-only production measurements approximately 17:26–17:35 UTC; repository baseline 7d73ec1. No production data, settings, or retention jobs were changed.

## Recommendation

Keep durable customer value; expire operational byproducts. Do not use a blanket age-based purge of conversations, memories, purchased media, or credit records. Introduce an explicit retention policy, daily bounded cleanup, aggregate reporting, and a separate review of legacy data.

“Indefinite” below means no automatic age-based deletion was identified in the inspected paths. It does not mean a contractual promise to retain forever, nor that account deletion cannot remove the record. This is a focused application/database audit, not certification of every table or third-party provider's retention.

## Live footprint

Sizes use decimal MB/GB and include table indexes and TOAST where applicable. Database size is not the same as allocated disk, backups, or the provider's billable storage metric.

| Area | Measured size | Meaning |
|---|---:|---|
| Whole PostgreSQL database | 564.3 MB | Approximately 538.2 MiB |
| Other public tables, outside `together_`/`kivelle_` prefixes | 344.1 MB | 147 tables; ownership/use must be established before deletion |
| Kivelli-prefixed tables | 128.0 MB | 184 tables |
| Cron tables | 47.6 MB | Almost entirely job execution history |
| Supabase object files | 1.030 GB | 3,209 objects, based on storage metadata sizes |

The groups do not sum to total database size: auth, storage metadata, internal schemas and other overhead also exist. Object-file bytes are separate from PostgreSQL storage metadata. External providers, CDN copies, local device caches and backups are not included.

Largest relations worth investigating:

| Table | Allocated MB | Exact rows checked |
|---|---:|---:|
| search_documents | 84.6 | 21,050 |
| feed_item_entities | 54.5 | 55,237 |
| cron.job_run_details | 47.6 | 65,406 |
| provider_raw_payloads | 47.1 | 2,353 |
| feed_items | 39.7 | 9,154 |
| content_routing_events | 39.3 | 100,707 |
| together_character_schedule_events | 21.6 | 14,794 |
| game_score_snapshots | 17.4 | 79,250 |
| together_schedule_templates | 16.6 | Not exact-counted |
| together_client_performance_events | 13.0 | 40,287 |
| together_adult_asset_grants | 8.0 | 20,885 |
| together_messages | 7.9 | 2,421 |

Database row estimates were substantially stale; exact counts above were queried separately. In particular, the large older tables are not empty. Their names suggest feed/search/sports ingestion ancestry; no matching references were found in the searched TS/JS application paths for search_documents, provider_raw_payloads or content_routing_events. That is not proof that SQL functions, another deployment or an external ingestion service no longer use them. The 344.1 MB is an investigation opportunity, not promised reclaimable space.

Object storage:

| Bucket | Objects | MB |
|---|---:|---:|
| kivelle-reference-media | 598 | 392.4 |
| kivelli-catalog | 2,320 | 247.9 |
| together-user-media | 140 | 234.2 |
| kivelle-character-reference | 148 | 153.5 |
| avatars | 2 | 1.6 |
| post-images | 1 | 0.1 |

Reference and catalogue files account for most object storage. A file's age does not establish that it is unused. Preserve images referenced by published characters/worlds, custom companions, versions or pending generation.

## Existing cleanup and concrete gaps

1. **Private upload/export cleanup exists and is running.** `together-life-dispatch` invokes cleanup every 30 minutes. It removes unattached conversation uploads older than two hours, removes attached upload files after their recorded expiry while retaining a metadata stub, expires ready account-export files, and retries storage deletion jobs. Exports have a 24-hour lifetime in `together-account`. Each category is capped at 100 records per invocation. Production contained 735 cleanup-cycle events; the latest was 17:30 UTC, with zero reported failures in the preceding 24 hours. All 19 storage cleanup jobs were complete. This is evidence of operation, not a complete orphan scan.
2. **Notification retention exists.** Daily SQL deletes presence one day after expiry, tap receipts after 90 days, budget reservations after 35 days, and notification records older than 90 days when read, cancelled or expired. Unread/unexpired records are intentionally excluded.
3. **Rate windows expire physically.** The daily job deletes windows one day after expiry. Context-hold recovery also removes unused expired `quoted` records after one day in the inspected migration; settled/closed quotes remain. The live table contained eight closed quotes.
4. **Media-access tokens accumulate.** Of 20,885 grants, 18,596 expired more than one day earlier. No corresponding scheduled purge was identified. These are expiring authorization records, not the photos themselves; pruning expired grants should preserve media.
5. **Cron history accumulates.** There were 65,406 execution rows, including 33,976 older than seven days and 149 older than 30 days. Approximately 4,948 scheduled executions occurred in the last day. No execution-history purge was identified. Cron success for HTTP dispatch confirms dispatch execution, not successful completion of the downstream worker.
6. **Raw performance/analytics/AI telemetry lacks an identified general TTL.** There were 40,287 performance events, 10,492 analytics events, and 4,268 AI usage events. None of the performance rows were over 30 days old, and none of the latter two were over 90 days old. The proposed limits mostly prevent future growth rather than deliver immediate savings.
7. **Archive expiry is not physical deletion.** The app gives explicitly archived chats a 30-day restore deadline and rejects expired restores. No matching age-based purge was found in the searched server paths, SQL functions or scheduled jobs. Seven chats were archived and none had expired at measurement. Add a cleanup path before this becomes an invisible permanent archive. Check cascades carefully: independently retained memories, gallery content and relationship state may need to survive chat removal.
8. **Account deletion has a durable retry workflow.** It stops new work, removes application/auth data and owned objects, retries failures, and retains a blocking deletion marker against late billing events. There were no deletion jobs in the live table at measurement. Retry exhaustion requires Ops intervention; it must not silently count as successful deletion.
9. **There is a policy/implementation gap.** The current privacy page says diagnostic records and generated assets have operationally limited retention, but a comprehensive enforced schedule was not identified. Publish specific periods only after implementation. A legacy `purge_expired_compliance_data` SQL function exists, but its invocation was not established; do not count it as effective cleanup.

## Proposed retention policy

These are recommended product/operational defaults, not existing behavior or statutory retention periods. Holds for an active dispute, incident or deletion retry override routine cleanup only for the necessary records.

| Data | Proposed rule | Preserve / prerequisite |
|---|---|---|
| Active chats, memories, personas, relationships, scenario progress, custom companions | Keep while the account retains them | No silent expiry because a user has not chatted recently |
| Saved/generated photos, videos and voice notes | Keep while retained by the user or referenced by active content | Do not delete paid content to reduce storage; remove through explicit deletion and orphan handling |
| World/character canon and active reference assets | Keep while used | Retain referenced versions; retire unreferenced superseded assets separately |
| Explicitly archived conversations | Purge after the displayed 30-day restore window | Preserve independent memories/gallery/relationship state according to the existing product contract; recheck restore races |
| Unattached uploads / account export files | Keep existing two-hour / 24-hour rules | Verify upload-in-flight protection and terminal export failures |
| Expired asset grants, suggestion caches, transient leases | Expiry + one day | Never remove a still-active lease; distinguish security expiry from business settlement |
| Unused context quotes | Existing expiry + one day | Reserved quotes must settle/refund first |
| Closed quote manifests and detailed turn diagnostics | 30 days for bulky details | Retain compact charge/request identity and refund evidence; inspect all readers before stripping fields |
| Successful cron runs | Seven days | Aggregate daily counts, durations and failures for 13 months |
| Failed cron runs | 30 days | Incident-linked exceptions; do not delete a currently running row |
| Raw performance events | 30 days | Daily distributions/error rates by release and platform for 13 months |
| Raw engagement analytics | 90 days | Daily cohort/funnel aggregates for 13 months; keep necessary non-content cohort keys to calculate retention correctly |
| AI usage/cost details | 90 days | Daily model/feature/tier costs and reconciled billing totals for 13 months; longer only where necessary for disputes/accounting |
| Detailed media-provider diagnostics and webhook payloads | 30 days successful; 90 days failed/resolved | Keep compact request IDs, outcome, delivery/refund status and replay protection; never expire unfinished work solely by age |
| Past generated routine schedule events | 30 days after end | Exclude plans, commitments, scenario evidence and user-visible history; preserve meaningful outcomes. Never age-purge schedule templates |
| Completed cleanup jobs and export metadata | 30 days after completion/expiry | Pending, held and failed jobs stay actionable; do not remove retry evidence prematurely |
| Sent transactional-email payloads | 30 days after delivery | Keep compact deduplication/event records to prevent duplicate welcome/support emails |
| Email rate-budget attempts | Window required by rate limiter + one day | Verify actual limiter queries before selecting a fixed TTL |
| Support tickets/replies/attachments | 12 months after final resolution | Reopened tickets reset the clock; unresolved disputes remain; sensitive attachments can use a shorter documented period |
| Ops/security/recovery audit details | 12 months initially | Restrict access; longer incident-specific preservation, not blanket indefinite payload retention |
| Unfinished companion drafts | Reminder at 60 inactive days; consider purge at 90 | Product change requires notice and recovery/export expectations; not a first-wave cleanup |
| Credit ledger, purchase/grant identities, subscription reconciliation | No blanket TTL in initial rollout | Never erase a balance, monthly allocation boundary, refund linkage or dedupe key. Define a separate accountant-reviewed financial archive policy |
| Deletion markers / billing replay suppression | Keep minimal durable identifiers while replay remains possible | Strip unnecessary personal payloads after completion; do not recreate deleted accounts on old webhooks |

Retaining compact identifiers is different from retaining complete provider payloads indefinitely. Aggregates must exclude conversation text and unnecessary personal identifiers; they must also be designed so Ops cost and engagement reports remain accurate after raw data expires.

## Implementation order

**First: small, safe operational expiry.** Add a service-only daily retention worker for expired grants/caches, terminal cron history and completed cleanup/export metadata. Run in dry-run mode first. There are at least 18,596 grant candidates today; the seven-day cron candidate count is 33,976 before distinguishing success/failure policy. Do not infer proportional MB savings from those counts.

**Second: preserve reporting, then limit telemetry.** Add idempotent daily rollups, verify totals against existing Ops reports, then enforce raw-data windows. Use histograms or mergeable distributions for latency; averaging daily p95 values is not a valid monthly p95. Sample successful high-frequency performance events at ingestion where possible; retain errors and account for sampling in reports.

**Third: remove genuinely unused legacy data.** Inventory jobs, functions, foreign keys, triggers, external ingestion and consumers for the 147 non-Kivelli public tables. Disable any confirmed obsolete producer before deleting its output. Maintain a time-limited recovery export where appropriate; moving everything to permanent cold storage simply relocates retention. No broad `CASCADE` or schema-wide deletion.

**Fourth: archive and media ownership cleanup.** Map all references, including JSON references and active workers. Expire explicitly archived chat content after its recovery deadline. Implement a two-pass orphan audit: record candidate objects, wait a seven-day grace period, then recheck references and active work immediately before removing them. Apply to superseded assets and abandoned generation intermediates, not retained gallery content.

**Fifth: support, financial and provider policy.** Separate durable business evidence from bulky diagnostics. Document third-party retention for AI/media/voice providers, Resend, RevenueCat, Apple/Google and error logs. Verify actual backup configuration and device-cache logout/account-deletion behavior. Those were not measured in this database review.

## Engineering requirements

- Use a registry of data class, owner, retention predicate, hold conditions, batch size and last successful cleanup. Avoid a generic “delete every row older than X” utility.
- Bounded indexed batches, a single-worker lease, a time budget, retries and resumable progress. Start around 500–1,000 database rows per transaction and tune from measured lock/latency impact.
- Compute eligibility again at deletion time to prevent races with restored chats, settled credits, active uploads and reopened tickets.
- Keep pending/retrying workflows, unreconciled financial events and minimal replay-protection records out of ordinary log cleanup.
- Improve the existing storage-cleanup query: it selects the oldest 100 pending/held jobs and then skips held user-owned jobs. Enough held jobs can starve later pending work. Filter eligibility before applying the limit.
- Existing cleanup audit records omit `exportsExpired`, although the helper returns it. Include all categories and failures in bounded aggregate metrics. Surface query failures rather than treating a missing result as zero work.
- Ops should show eligible rows, rows removed, bytes removed from object storage, queue age, last success and errors. Alert on growing expired backlogs and incomplete account deletion.
- Add boundary tests for expiry, retries, concurrent restore/upload, FK effects, duplicate billing/email callbacks and credit invariants. Verify deletion of objects, not only their metadata.

## Storage and backup caveats

Delete object files through the Storage API; SQL removal of `storage.objects` only removes metadata and can orphan the file. Supabase supports up to 1,000 objects per `remove` call. [Supabase object deletion documentation](https://supabase.com/docs/guides/storage/management/delete-objects).

Deleting database rows does not guarantee an immediate drop in allocated disk or cost. PostgreSQL can reuse freed space; any compaction/index maintenance should be separately planned after measuring bloat. [Supabase database and disk sizing](https://supabase.com/docs/guides/platform/database-size).

Database backups do not include actual Storage API object files. This audit did not verify Kivelli's configured backup/PITR window or external media backups. A restore process must also replay subsequent deletion requests before reopening service so deleted personal data does not reappear. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

## Evidence paths

- `supabase/functions/together-life-dispatch/index.ts`: cleanup ordering, expiry checks, batch limits and audit.
- `supabase/functions/together-account/index.ts`: 24-hour exports, account deletion staging.
- `supabase/functions/_shared/kivelle-account-deletion-worker.ts`: durable deletion, storage retries, billing markers.
- `supabase/functions/_shared/together-conversation-archive.ts` and `together-conversation/index.ts`: restore deadlines and expired access rejection.
- `supabase/migrations/202608170003_kivelle_multimodal_cleanup.sql`: queued object cleanup on canonical row deletion.
- `supabase/migrations/20260907220440_context_pricing.sql`: context reservation settlement and expired unused quotes.
- Live `kivelle_cleanup_notification_retention`, cron inventory and aggregate table/object measurements.
- `apps/together/app/privacy-policy.tsx` and `docs/operations.md`: current stated retention/deletion behavior.

No customer message text, media contents, credentials or private support contents were exported into this report.
