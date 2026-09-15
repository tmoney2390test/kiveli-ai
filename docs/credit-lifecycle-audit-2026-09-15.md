# Credit lifecycle audit — September 15, 2026

## Current customer rules
- Purchased and welcome credits are permanent. Purchases: 250 / $4.99, 700 / $11.99, 1,750 / $27.99, 4,500 / $59.99.
- Plus: 500 credits per benefit month, subscription bucket cap 1,000. Max: 1,200 per month, cap 2,400. Annual plans receive monthly benefits, not a full year upfront.
- Benefits use UTC calendar-month identity; provider refresh/replay cannot refill a month's spent allowance.
- Spending uses subscription credits before permanent credits.
- Subscription credits have the existing 30-day post-membership grace lifecycle; purchased credits remain. Plan downgrades can reduce subscription balance to the lower cap; same-month re-upgrades restore eligible reductions.

## Findings and fixes
1. Duplicate wallet requests checked idempotency before taking the wallet lock. They could race and fail with a uniqueness error even though one succeeded. Permanent grants and spending now check under the lock.
2. Refunds used the retry key, allowing different failure paths to refund the same charge twice. They now deduplicate by original charge, with a unique database index.
3. Late failure refunds could return subscription credits to an expired/full bucket and later lose them. The portion that cannot fit becomes permanent compensation; total refund remains exactly the original charge. Ordinary rollover rules are unchanged.
4. Direct spending could use an expired bucket if lifecycle reconciliation was bypassed. Spending now enforces expiry atomically and records the adjustment.
5. A delayed grant could rewind the benefit cycle. Older cycle grants now return stale without mutation.
6. Annual RevenueCat reconciliation used the original purchase month. It now targets the current month. The daily annual sweep is paginated instead of stopping at 1,000 subscriptions.
7. A terminal media failure could remain charged if its first refund failed. A protected recovery sweep runs every five minutes, with original-charge deduplication and shared-charge safeguards.

## Production audit
- All 13 credit wallets reconciled with ledger totals; no negative balances or duplicate original-charge refunds found.
- Found one historical failed photo, dated August 21, with an unreturned 10-credit charge. Refunded through the ledger. Post-repair: zero unmatched failed/rejected/cancelled media charges and zero wallet/ledger mismatches.
- No stale expanded-context reservations older than one hour.
- Wallet and ledger clients have SELECT policies only; mutation RPCs remain service-only.
- Existing annual grant cron has recent successful dispatches. Direct authenticated scheduled endpoint check returned HTTP 200, zero failures; there are currently no active annual subscribers, so this was not a real annual purchase test.

## Verification and rollout
- Isolated PGlite tests: rollover/cap, no refill on replay, upgrade/downgrade/restoration, 30-day grace, purchased-credit preservation, stale grants, spend retries, charge-level refund deduplication, expiry/cap-boundary refunds, media refund recovery, insufficient funds, ledger reconciliation and client denial.
- Existing store purchase and expanded-context admission SQL tests passed.
- Nine RevenueCat, store-credit and daily-photo tests passed; 1,124 domain tests passed; Edge Function type checks passed.
- Migration 20260915152625 applied. Updated live bundles preserving unrelated changes: billing-grants 76, revenuecat-webhook 62, subscription 147.
- Server-side rollout; no mobile or web bundle required. No prices or advertised credit allocations changed. No real purchases were made.

This audit verifies the exercised paths and current ledger, not a guarantee against future provider outages or every possible store event sequence.
