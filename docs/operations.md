# Kivelle production operations

The authenticated `/ops` route is Kivelle's private operations control room. It is backed by `together-ops`; navigation visibility is never the security boundary. Every request resolves a server-owned role from `TOGETHER_ADMIN_USER_IDS` or auth app metadata:

- `viewer`: dashboards, queues, incidents, releases, and alert state;
- `support`: viewer access plus exact account lookup and ticket workflow;
- `admin`: support access plus guarded recovery, refunds, session invalidation, alert edits, and the audit trail.

Use `together_ops_role` with `viewer`, `support`, or `admin`. Existing `together_admin=true` maps to admin and `together_internal=true` maps to viewer.

## Control-room views

- **Overview:** health scorecard and unresolved incidents.
- **Queues:** active count, oldest age, failure volume, provider/model success, p95 latency, and estimated cost for dialogue, media, voice, push, and proactive work.
- **Incidents:** acknowledge, monitor, assign, resolve, and reopen grouped operational failures.
- **Support:** priority, status, assignment, tags, internal notes, and immutable ticket history.
- **Users:** exact email or UUID lookup with entitlement, credits, version, and sanitized recent failure metadata.
- **Alerts:** editable thresholds, cooldowns, severities, channels, delivery history, and manual evaluation.
- **Releases:** deployed commit, web deployment, migration version, Edge versions, and observed client-version adoption.
- **Audit:** admin-only append-only record of operator reads and mutations.

The control room intentionally excludes prompts, messages, transcripts, Persona, memories, content preferences, signed media URLs, access tokens, provider payloads, IP addresses, device fingerprints, and credentials.

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

Native clients request permission only when the user enables push. Tokens remain server-side in `together_push_tokens`. Expo tickets are recorded in `together_push_deliveries`; the life dispatcher checks receipts and deactivates permanently invalid device tokens.

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

Use Supabase managed backups and point-in-time recovery according to the project plan. Restore into a separate project first, validate schema/version and representative user continuity, then perform a controlled cutover. Never test restores by overwriting production.
