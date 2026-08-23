# Kivelle production operations

The authenticated `/ops` route is a private control room backed by `together-ops`. Access is enforced on the server with `TOGETHER_ADMIN_USER_IDS` or the `together_admin` / `together_internal` auth app-metadata flags. Hiding the route in navigation is not the security boundary.

The dashboard reports aggregate and sanitized operational data:

- client error counts and recent sanitized error signatures;
- open support tickets and status management;
- active, failed, and stale generated-media work;
- active and failed voice calls;
- push ticket/receipt failures;
- 24-hour AI success rate, p95 latency, and estimated/actual provider cost;
- new account counts.

It intentionally excludes prompts, messages, transcripts, signed media URLs, access tokens, provider payloads, and credentials.

## Client diagnostics

`AppErrorBoundary` records authenticated render crashes through `together-ops`. Reports remove common secret/email patterns, cap message and stack sizes, and retain only route, platform, version, hash, correlation ID, and a small scalar metadata object. Set `EXPO_PUBLIC_KIVELLE_ERROR_REPORTING_ENABLED=false` to fail closed during a reporting incident.

## Support

Users create tickets in `/support`. Tickets are rate limited, private under RLS, and do not automatically copy chat history. A user can see their own ticket metadata; operations accounts can update status and priority.

## Push delivery

Native clients request permission only when the user enables push. Tokens remain server-side in `together_push_tokens`. Expo tickets are recorded in `together_push_deliveries`; the life dispatcher checks receipts and deactivates permanently invalid device tokens.

## Incident checklist

1. Check the `/ops` health banner and stale queue counts.
2. Correlate a support ticket with a sanitized error by correlation ID.
3. Inspect Supabase Edge logs for the same ID without logging conversation content.
4. Disable only the affected provider/feature flag; text chat must continue to work.
5. Verify the queue drains and error rate returns to baseline before re-enabling.
6. Record the incident timeline, customer impact, remediation, and follow-up test.

## Recovery

Use Supabase managed backups and point-in-time recovery according to the project plan. Restore into a separate project first, validate schema/version and representative user continuity, then perform a controlled cutover. Never test restores by overwriting production.
