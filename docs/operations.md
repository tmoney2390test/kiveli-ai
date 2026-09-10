# Kivelle production operations

The authenticated `/ops` route is Kivelle's private operations control room. It is backed by `together-ops`; navigation visibility is never the security boundary. Every request resolves a server-owned role from `TOGETHER_ADMIN_USER_IDS` or auth app metadata:

- `viewer`: dashboards, queues, incidents, releases, and alert state;
- `support`: viewer access plus exact account lookup and ticket workflow;
- `admin`: support access plus guarded recovery, refunds, session invalidation, alert edits, and the audit trail.

Use `together_ops_role` with `viewer`, `support`, or `admin`. Existing `together_admin=true` maps to admin and `together_internal=true` maps to viewer.

## Control-room views

- **Engagement (default):** UTC date presets/custom range, current free/paid segments, internal-account exclusion, activity trends, new-account milestones, exact-day retention cohorts, companion/world/scenario performance, media outcomes, provider costs, proactive outcomes, feature adoption, aggregate CSV export, and a copyable owner briefing. Optional foreground-only refresh runs every minute.
- **Overview:** health scorecard and unresolved incidents.
- **Queues:** active count, oldest age, failure volume, provider/model success, p95 latency, and estimated cost for dialogue, media, voice, push, and proactive work.
- **Incidents:** acknowledge, monitor, assign, resolve, and reopen grouped operational failures.
- **Support:** priority, status, assignment, tags, internal notes, and immutable ticket history.
- **Safety reports:** protected severity queue, explicit assignment/status/resolution, least-context message access, and an audit event for every reviewer view or mutation.
- **Users:** exact email or UUID lookup with entitlement, credits, version, and sanitized recent failure metadata.
- **Alerts:** editable thresholds, cooldowns, severities, channels, delivery history, and manual evaluation.
- **Releases:** deployed commit, web deployment, migration version, Edge versions, and observed client-version adoption.
- **Audit:** admin-only append-only record of operator reads and mutations.

The control room intentionally excludes prompts, messages, transcripts, Persona, memories, content preferences, signed media URLs, access tokens, provider payloads, IP addresses, device fingerprints, and credentials.

## Engagement access and data quality

Open `https://kivelli.app/ops`, or **Settings → Admin console** on an authorized account. The settings link asks the authenticated server for access; hiding the link never substitutes for server authorization. A missing role returns 403 for both dashboards. Only an explicitly identified owner account should receive an admin role; the shared QA login is not automatically elevated.

Engagement reports use only Kivelle `together_profiles`, respect current analytics opt-outs, and exclude labeled test/staff accounts and configured operations accounts by default. The existing test7 QA account is labeled test. Admins can classify another exact account ID under Engagement → Data with a written reason. Classification and audit insertion are atomic and do not change permissions. Role-bearing accounts remain internal even if labeled customer.

`together_engagement_events` records only a random event/session ID, account ID, allowlisted surface, onboarding step, capped foreground seconds, platform, and server timestamp. Auth/debug/ops routes, URL parameters, chat bodies, prompts, and media URLs are not collected. Recording is authenticated, rate-limited, idempotent, server consent-checked, and best effort. Tables use RLS with service-only access and account-delete cascades. Foreground time is approximate across tabs and visits, not proof of attention; browser shutdown, throttling, and failed requests may undercount. A 30-minute inactivity gap renews the session.

Historical activity derives from retained completed human messages; new page/onboarding instrumentation begins at deployment. Dates and exact day-1/7/30 retention use UTC. Only fully elapsed return days are eligible; the report shows denominators and flags samples below 20. New-account milestones are independent, not a strict drop-off funnel. Current entitlement records and companion locations are not historical snapshots. Scenario rows show current statuses for sessions started in the window. Deletion and resets can reduce historical metrics.

Media success uses canonical requests created in the window and excludes pending requests from its denominator. Provider rows count attempts, including retries; price coverage is explicit, and known costs are neither profit nor revenue. Proactive reply counts are associations within 24 hours, with recent deliveries only partially observed, and exclude identified plan reminders. Operational tabs retain their existing broader scopes. Do not compare their totals directly against customer-only engagement reports.

New service-only RPCs: `kivelle_engagement_dashboard`, `kivelle_record_engagement`, and `kivelle_label_engagement_account`. The report limits windows to 93 days; previous-period comparison matches the selected duration. Client refreshes suppress stale responses and label retained data after errors. CSV exports include applied filters, coverage, and metric definitions and escape spreadsheet formula cells.

## Guarded support actions

Media retry, provider-job termination/refund, exact credit restoration, and session invalidation are server-authoritative. Sensitive actions require:

1. the correct operations role;
2. an exact target ID;
3. a written reason;
4. an explicit UI confirmation of the target;
5. an append-only audit record.

Media retry preserves the original charge. Failed active provider jobs use the existing exact media refund path. Manual credit restoration only accepts a specific prior spend-ledger transaction and records a compensating entry; it never accepts an arbitrary balance.

Session invalidation writes a server-owned cutoff to auth app metadata. Edge functions reject access tokens issued before that cutoff; the user must sign in again.

## Alerts

Alert evaluation runs during the existing life-dispatch cycle and can also be run manually from `/ops`. Dashboard incidents are always available. Optional external delivery is fail-closed:

```env
KIVELLE_OPS_ALERT_WEBHOOK_URL=
RESEND_API_KEY=
KIVELLE_OPS_ALERT_EMAIL=
KIVELLE_OPS_ALERT_FROM=Kivelle Ops <ops@example.com>
```

Rules are seeded for stalled media/dialogue/proactive queues, media/voice/push failures, AI failure rate and p95 latency, refund volume, and authentication client errors. Delivery payloads contain only incident IDs, metric values, thresholds, and sanitized labels.

## Release health

Set the following values in the deployment environment when available:

```env
KIVELLE_RELEASE_COMMIT=
KIVELLE_WEB_DEPLOYMENT_ID=
```

Record a release after the database, Edge functions, and web app are live. Client version heartbeats run at most every 12 hours per authenticated account and store only platform, application version, build ID, and timestamps.

## Client diagnostics

`AppErrorBoundary` records authenticated render crashes through `together-ops`. Reports remove common secret/email patterns, cap message and stack sizes, and retain only route, platform, version, hash, correlation ID, and a small scalar metadata object. Set `EXPO_PUBLIC_KIVELLE_ERROR_REPORTING_ENABLED=false` to fail closed during a reporting incident.

## Support

Users create tickets in `/support`. Tickets are rate limited, private under RLS, and do not automatically copy chat history. Users can see their own ticket metadata; support and admin operators work the ticket through the server-only operations API.

## Push delivery

Native clients request permission only when the user enables push. A SecureStore installation UUID scopes registration, account reassignment, logout, and deactivation so one device cannot disable every device on the same platform. Expo tickets are recorded in `together_push_deliveries`; provider acceptance, device-service receipt, and user open remain separate states. `DeviceNotRegistered` deactivates only that token. `InvalidCredentials` preserves tokens and opens a provider-configuration incident.

Push copy is discreet and payloads are versioned. Never include conversation text, explicit captions, sensitive locations, prompts, thumbnails, signed URLs, or storage keys. Expo acceptance and receipts are operational signals, not proof that a person saw a notification; exactly-once delivery is not claimed.

## Incident checklist

1. Check `/ops` Overview, Queues, and the active incident timeline.
2. Acknowledge and assign the incident; link affected support tickets when applicable.
3. Correlate sanitized failures using IDs and timestamps, never conversation content.
4. Inspect Supabase Edge logs for the same IDs without logging prompts or transcripts.
5. Use the narrow recovery action, or disable only the affected provider/feature flag.
6. Verify queue age, failure rate, and provider health return to baseline.
7. Move the incident to monitoring, then resolved, with a safe internal note.
8. Record the release and follow-up regression test.

## Privacy and access review

Review operations membership at least monthly and after every staffing change. Use app metadata rather than client-editable user metadata. Remove access immediately when no longer required. Audit data is server-only and immutable; export only for a concrete security or support investigation.

Do not paste chat text, prompts, transcripts, image URLs, API keys, or user profile content into incident summaries, ticket notes, webhook endpoints, or email alerts.

## Recovery

Use Supabase managed backups and point-in-time recovery according to the project plan. Restore into a separate project first, validate schema/version and representative user continuity, then perform a controlled cutover. Never test restores by overwriting production. Record a real restore as passed only after an authorized isolated restore was actually completed.

## Account deletion recovery

Deletion writes a blocking marker and durable job before destructive work. New authenticated work stops while the marker exists. Storage objects and provider identifiers are captured before relational deletion, so retries do not depend on profile rows that may already be gone.

The deletion worker retries legacy Stripe cancellation when one is required, app-data deletion, owned Supabase Auth-user deletion, and storage cleanup. It also reclaims a `processing` job whose lease is stale, uses the deletion request ID for provider idempotency, and applies bounded exponential retry. A database deletion pass rolls back if Kivelle-owned user rows remain instead of falsely marking the job complete. After retry exhaustion the job remains blocked in `failed` for operator review; the deletion marker must remain in place.

Apple/Google store subscriptions do not block deletion and are not represented as canceled; the user receives the verified original-store management path. Late billing events are acknowledged against the retained deletion marker without recreating a profile, granting credits, or notifying a deleted account. Review `retry`/stale `processing` jobs, `failed` jobs, and `storage_cleanup_pending` failures from operations. Retry the durable job after correcting the underlying provider or database incident; never remove the marker merely to make a retry look successful.
