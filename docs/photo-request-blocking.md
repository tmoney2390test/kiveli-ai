# Photo request rejection and recovery

Authored photo intent is checked before prompt rewriting. Requests requiring adult photo authorization return `PHOTO_CONTENT_BLOCKED` (403, non-retryable) when that authorization is absent. Native/unknown sessions do not have verified web adult authorization. Eligible web requests continue through the existing adult safety checks.

Checks cover dialogue entry, offer creation and acceptance, direct photo queues, edits, and provider prompt preparation. Acceptance checks precede credit charging and daily allowance reservation. No safe replacement offer is created for a disallowed request.

The chat client checks native prompts before showing an optimistic offer. Blocks provide Edit request and Dismiss actions. A confirmation deadline runs independently of network reads; status reads and acceptance waits are bounded. Late offer discovery cannot dispatch an expired queued acceptance. Interrupted acceptance still reconciles the existing server offer before exposing another attempt.

Server entry-point blocks are recorded as `photo_request_blocked` analytics events with classification, client surface, correlation/request IDs, and conversation context. Shared guards also emit structured logs. These diagnostics omit the raw prompt. Client-only preflight blocks do not send a request or create server telemetry.

Validation: domain policy/media tests, client photo recovery tests, edge typechecks, and mocked edge tests proving no offer creation, credit RPC, or allowance claim occurs on blocked requests. The edge regression is included in CI.

Release requires deploying the affected edge functions (including callers importing the shared media helpers) and releasing the updated client. Backend deployment can enforce policy for older clients, but their UI recovery requires a new client build. This change does not retroactively alter pending offers or historical images.
