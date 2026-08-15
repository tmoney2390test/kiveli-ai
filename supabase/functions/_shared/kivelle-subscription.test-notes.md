# Kivelle subscription invariants

- Free, Plus, and Max share canonical relationship/world truth; tiers change depth, limits, and routing frequency rather than character correctness.
- Subscription credits and permanent credits are separate balances. Subscription balance spends first.
- Purchased/permanent credits do not expire. Subscription grants are idempotent per billing period and capped by tier rollover.
- Explicit user media is credit-metered; automatic Kivelle media is not.
- Terminal paid media failures refund the original transaction buckets.
- Billing state is server-owned and may only be synchronized through the signed billing webhook.
