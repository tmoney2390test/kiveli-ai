# Context pricing release

Included preserves the existing 9K / 14K / 20K plan budgets. Plus and Max can select Extended (32K) or Maximum (64K) in direct and group chat settings. These are estimated assembled-input ceilings; instructions and retrieved material share the allowance with history. Saved memory entitlements remain unchanged.

The composer obtains a server quote after a 700 ms pause. Send authorizes its displayed maximum. Quotes expire after 60 seconds and bind the draft, recipients, conversation state, subscription state, context choice, and pricing version. The server checks the final prompt, provider, model, output budget, and allowed reply count before generation. An expansion that adds no context uses Included and costs zero. Ordinary included chat and background features retain their existing behavior.

Credit reservations reduce the existing spendable wallet under its account lock. Each complete assistant message and its receipt commit in one database transaction. Finishing a turn releases unused credits; a scheduled recovery handles abandoned holds. Permanent and subscription allocations are retained separately, and refunds respect plan-credit expiration and rollover. Duplicate requests cannot spend the same reservation twice. Group continuations can use multiple reply slots, including repeated speakers, within the approved total.

The initial registry covers GPT-5.6 Luna, GPT-4.1 Nano, and Grok 4.3. It uses integer microdollars, a $0.010 provider-cost budget per credit, and a $0.004 supporting-call allowance per completed paid reply. Actual cache savings can lower the final charge. Reasoning already included in provider output usage is counted once. Unknown models disable paid quotes. Quote issuance pauses after October 7, 2026 until rates are reviewed. These are conservative operating parameters, not a guarantee of subscription profitability; compare actual total model/support/retry costs and net plan receipts after launch.

Photo attachments currently require choosing Included for that message in the composer. Photo-generation actions continue to use their existing price flow. Continue and Let them talk obtain their own quotes; when no matching quote is displayed, the first click prepares a price and a second click authorizes it.

## Verification

- Application and domain tests pass (1,710 tests at initial verification), with existing gateway/audit tests also passing.
- Edge function type checks pass for all six changed entrypoints using the pinned dependency versions installed locally. The default Deno registry fetch was blocked in this environment, so a temporary local import map was used for validation.
- Price tests cover provider/input/cache differences, maximum-charge enforcement, free fallbacks, and draft fingerprint changes.
- `pnpm context:test:db` executes the migration against embedded PostgreSQL fixtures, checking reservation idempotency, insufficient funds, stale quotes, atomic message settlement, partial refunds, crash recovery, bucket provenance, repeated speakers, and service-only permissions.
- The production web export builds and its same-origin Supabase configuration passes verification.
- Full Supabase migration compatibility is additionally checked by the repository database CI workflow. Embedded PostgreSQL fixtures do not substitute for that gate.
- Live browser visual review is still pending: this environment's browser could not reach the local preview.

## Deployment

1. Pass repository CI and the database workflow for this branch.
2. Apply `20260907220440_context_pricing.sql` once.
3. Deploy `together-dialogue-quote`, `together-dialogue`, `together-group-dialogue`, `together-conversation`, `together-group`, and `together-subscription`, including their shared/domain dependencies. Each endpoint authenticates requests in its handler.
4. Export the web app with `EXPO_PUBLIC_SUPABASE_WEB_URL=https://kivelli.app/supabase` and the existing public project key. Run the production verification script.
5. Authenticate Wrangler to the existing Cloudflare account and deploy `infra/cloudflare/kivelli-app-gateway/wrangler.jsonc`. Preserve the existing surface-signing secret and custom domains.
6. Check direct/group settings, keyboard and touch tooltips, a zero-charge short conversation, a priced long conversation, low balance, expired quotes, interrupted streaming, and group partial refunds with an authorized test account.
7. Native users need the same client update through the existing native release process.

Cloudflare was not authenticated in this workspace when the release was prepared. No Cloudflare plugin was available. Do not report the web feature as live until that deployment and authenticated checks succeed.
