# Support and recovery expansion

Status: proposed follow-up; this release implements the account popup and membership layout fixes only. Existing settings, profile/gallery, billing behavior, memory categories, and recovery rules are preserved.

## Existing foundation

- Help center, authenticated support requests, ticket status and Ops replies already exist.
- Archived chats have an existing restore flow; Settings describes a 30-day recovery window. Restoration can keep a newer current thread in history.
- Native membership includes restore purchases and pending-purchase recovery. Credit balances and adjustments are server-authoritative.
- The new account popup makes Help & support and Plans & credits directly reachable. These links reuse the existing pages.

## Phase 1: Make recovery discoverable

Expand the existing Help center with problem-based entries: missing purchase or credits, missing conversation, stuck photo/video, login/account access, and other problems. Keep the existing ticket system and pages.

Each entry first offers the relevant current action: restore purchases in the purchasing app, view credit activity, open archived chats, refresh a request status, or review sign-in provider/account. Never encourage a second purchase or a duplicate generation to recover an existing one. Display the account and store involved without disclosing another account's existence or private details.

For archived chats, show the actual remaining recovery time from server timestamps. Do not imply a permanently deleted account, purged media, or reset relationship can already be restored.

## Phase 2: Better support requests

Add structured category, affected conversation/media request/purchase reference, app version, platform, and correlation ID. Reuse existing request IDs and deduplicate repeat submissions. Preview attached diagnostics; omit credentials, receipts containing unnecessary personal data, and unrelated chats. Including a specific message or screenshot is an explicit user choice.

Preserve draft requests through connectivity failures. Keep one ticket reference across submission retries. Show open, awaiting support, awaiting your reply, and resolved states with a timeline. Allow users to reply or reopen within a defined support window. Show email-delivery failures to Ops and retain the in-app reply even when email fails. Publish response expectations only after staffing and monitoring support them.

## Phase 3: Diagnose before changing data

Provide an Ops case view combining the selected ticket, request lifecycle, provider outcome, delivery status, credit reservation/charge/refund, and notification delivery. Restrict access by role and log access and mutations.

Offer narrow server-validated actions: reconcile a verified store transaction, re-deliver an existing completed media result, refresh an uncertain generation, release an invalid reservation, or restore a retained chat. Each action needs an idempotency key, reason, before/after audit record, and ownership checks. Never use a manual balance overwrite or restart paid generation merely because delivery failed. If provider completion is uncertain, reconcile it before refunding or retrying.

Store refunds and cancellations remain with the relevant store; account benefits must track verified transaction events. Disputed ownership goes to review, not automatic cross-account transfer.

## Phase 4: Recovery guarantees backed by tests

Run account-scoped exercises for: purchase accepted while app closes; repeated restore; delayed and duplicate callbacks; media completed but delivery interrupted; archived chat restoration with a newer active thread; expired recovery window; support email failure; and loss of connection while submitting a ticket.

Verify ledger invariants after every financial case: one grant/charge/refund per operation, no negative available balance, no accidental credit expiry, and no duplicate benefits. Verify another user or Life cannot access recovered material.

Perform a backup restore into an isolated environment and measure restoration time and data loss against explicit targets before promising recovery. Keep privacy deletion and retention policies authoritative; backup restoration must not resurrect deleted accounts into production.

## Phase 5: Optional undo for destructive resets

First map exactly which transcript, relationship, scenario, schedule, and memory fields each reset changes. Propose an encrypted, account-scoped pre-reset snapshot and short undo window only after confirming retention and deletion behavior. Undo must detect subsequent activity and explain whether it restores a previous state or creates a separate recovered conversation. Do not silently overwrite newer messages. This is new work, not an existing guarantee.

## Release order and acceptance

1. Recovery entry points and structured ticket diagnostics.
2. Ops reconciliation tools and real alert-delivery verification.
3. Device purchase/media recovery exercises and isolated backup restore.
4. Consider reset undo after the above is proven.

Success means users can find the right recovery action from the account popup, a failed operation has one traceable case, support can explain its charge and delivery status, retries cannot duplicate credits or content, and every promised recovery path has been exercised successfully.
