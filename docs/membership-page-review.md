# Membership page review and redesign

Reviewed `main` at `764ad58739f186a9506b3f18a1ecc906774c2b2d` on September 10, 2026. This review describes repository behavior; it does not verify live store prices, deployed feature flags, or an individual production account.

## Design changes

The old comparison repeats every label inside three disconnected cards, uses text as small as 7–10 px, and gives minor limits the same emphasis as the reasons to subscribe. The redesign makes prices, Credits, and meaningful plan differences the first things a reader sees.

- Three distinct plan summaries: neutral Free, violet Plus, and a restrained gold accent for Max. Serif plan names sit alongside readable interface type and tabular prices.
- One shared comparison with aligned columns on desktop, grouped into conversations and memory, photos and Credits, and worlds and companions. On narrow screens, each feature displays Free, Plus, and Max together, so users can compare without scrolling through three long lists.
- Readable 14–16 px content, 12 px minimum secondary metadata, less heavy bold text, calmer borders, and more deliberate spacing. Width and text scale determine layout using the actual content area inside the app shell.
- A current-plan indicator, monthly/yearly comparison, clear annual billing totals, and actions appropriate to the account’s existing billing provider.
- Existing members retain their account summary, credit wallet, purchase controls, and activity. Free users see membership choices before their credit history.
- The existing portal artwork is reused. No new dependencies, prices, allowances, server gates, or billing endpoints are introduced.

## Current standard plan differences

The amounts below come from the shared subscription catalog. Individual accounts can have server-managed entitlement overrides. The page uses the returned catalog for comparisons and the account’s effective capabilities and entitlement keys for its own benefits.

| Benefit | Free | Plus | Max |
| --- | --- | --- | --- |
| Monthly catalog price, USD | $0 | $19.99 | $39.99 |
| Yearly catalog price, USD | — | $199.99 | $399.99 |
| Active conversations | 5 | 20 | 50 |
| Messages | 20/day | Unlimited | Unlimited |
| Included companion photos | 0 | 1/day | 3/day |
| Included completed-date photos | 0 | 1/month | 3/month |
| Monthly Credits | 0 | 500 | 1,200 |
| Plan Credit rollover cap | 0 | 1,000 | 2,400 |
| Lives | 1 | 3 | 10 |
| Custom companions | 1 | 5 | 20 |
| Share your own photos | No | Yes, no Credits | Yes, no Credits |
| Group chats | No | Yes | Yes |
| Companion-initiated messages | No | Yes | Yes |
| Memory inspector and manual controls | No | Yes | Yes |
| Memory/continuity profile | Core | Deep | Director |
| Media queue | Standard | Priority | Highest |
| World access while the current build switch is on | All published worlds | All published worlds | All published worlds |

Source: [shared tier catalog](../packages/together-domain/src/entitlements.ts), [subscription status API](../supabase/functions/together-subscription/index.ts), and [world-access switch](../packages/together-domain/src/world-access.ts).

## Gates that affect the wording and actions

### World access is currently open

`OPEN_PUBLISHED_WORLDS_DURING_BUILD` is `true`. The server checks `hasOpenBuildWorldAccess` before the standard paid world rules. Therefore Free users can currently enter all published worlds. Unpublished worlds remain inaccessible. The previous page’s Free-versus-paid world copy did not express this override.

The redesigned comparison reads the same switch, presents the current access accurately, and hides early access as a paid differentiator while all published worlds are open. When the shared switch is turned off, the comparison resumes the catalog’s standard-world and early-access distinctions automatically.

Sources: [world access](../packages/together-domain/src/world-access.ts), [world gate](../supabase/functions/_shared/together-place.ts).

### Memory has real differences, with execution conditions

Core/Deep/Director budgets are 6/12/20 retrieved memories, 10/18/28 recent turns, and 1/3/6 history retrievals. Included context has ceilings of 9K/14K/20K tokens. These are budgets, not promises that every reply uses the full amount; the fast-chat path can use less context.

Director planning is eligible at progressively more interaction levels: major only, meaningful, then normal and above. Provider availability, latency safeguards, response mode, and reasoning preferences still affect whether it runs. The page describes broader memory and more frequent scene planning without promising perfect recall or a Director call on every message.

The current direct and group dialogue schemas accept only `contextPreference: 'included'`. Dormant 32K/64K domain helpers do not establish that expanded context is available. No expanded-context allowance is advertised.

Reasoning ceilings are Low/Medium/High by tier. They are separate from context capacity and memory retrieval.

Sources: [catalog](../packages/together-domain/src/entitlements.ts), [context budgets](../packages/together-domain/src/context-budget.ts), [prompt compiler](../supabase/functions/_shared/kivelle-intelligence.ts), [Director](../supabase/functions/_shared/kivelle-director.ts), [reasoning rules](../packages/together-domain/src/chat-generation.ts), [direct dialogue](../supabase/functions/together-dialogue/index.ts), [group dialogue](../supabase/functions/together-group-dialogue/index.ts).

### Paid social and memory features were undersold

Photo sharing checks the `photo_sharing` entitlement on the server. Group chats check `group_chat`; companion initiative checks `proactive_messages` and the user’s preferences. Memory review/curation checks inspector and manual-control access. Both paid tiers include these features. The previous Max benefit list omitted photo sharing, making inheritance unclear.

Sources: [photo-sharing gate](../supabase/functions/_shared/kivelle-subscription.ts), [group gate](../supabase/functions/_shared/kivelle-group-chat.ts), [initiative](../supabase/functions/_shared/together-life.ts), [memory controls](../supabase/functions/together-memory/index.ts).

### Photos, voice, and Credits are separate from unlimited chat

Included daily standard photos and monthly completed-date souvenirs are separate allowances. Additional eligible media uses Credits. The default user-requested photo limit is 12/day for every tier; an explicit server-managed unlimited-media override can remove it. Platform, preferences, content, subject, and provider gates still apply.

Voice routes currently include **zero minutes** for every tier. Availability also depends on server configuration and account rollout. The page does not advertise free minutes, unlimited media, or guaranteed generation speed.

Monthly plan Credits are granted monthly even on yearly memberships. Plan Credits have a rollover cap and are spent before permanent Credits. The subscription lifecycle currently reconciles a 30-day post-subscription grace period; bought Credits do not expire.

Sources: [photo offers](../supabase/functions/_shared/together-media-offers.ts), [subscription accounting](../supabase/functions/_shared/kivelle-subscription.ts), [voice routes](../supabase/functions/_shared/voice-routes.ts), [media priority](../supabase/functions/_shared/together-media.ts).

### Subscription checkout and top-ups have different gates

- New memberships are purchased in the native iOS/Android app using the existing RevenueCat integration. New web subscription checkout is disabled. Existing store entitlements work on the web.
- Existing paid members change or cancel through the management action returned for their billing provider. The page does not create a second subscription to upgrade a paid user.
- Free, trialing, past-due, and app-store-managed accounts do not qualify for the current web credit-pack checkout. The server’s `canPurchaseCredits` and the individual pack’s configuration remain authoritative.
- Directly provided access has no subscription-management action. The member summary no longer shows a catalog subscription charge for that granted access.
- Purchase confirmation, restore, cancellation, syncing, payment issues, credit activity, and contextual return navigation are retained.

Sources: [billing-management rules](../packages/together-domain/src/billing.ts), [subscription endpoint](../supabase/functions/together-subscription/index.ts), [web billing policy](../supabase/functions/_shared/web-billing-policy.ts), [native purchases](../apps/together/src/lib/nativePurchases.native.ts), [membership screen](../apps/together/app/subscription.tsx).

### Annual store-price display corrected

RevenueCat returns a localized price for the whole selected package. Previously an annual package price could be rendered with `/ month`. Localized annual prices now use `/ year`; catalog-only annual comparisons show the monthly equivalent alongside the full yearly total. Catalog savings are not displayed as a claim about localized store prices.

## Validation

- Application TypeScript check passed.
- ESLint passed for all changed application files.
- Membership presentation tests: 15 passed, including annual store periods, open-world access, paid feature inheritance, effective limits, and separate photo allowances.
- Existing entitlement, billing, and world-access tests: 27 passed.
- Full Expo web export passed using the repository CI placeholder Supabase configuration. Both `/subscription` and the existing `/upgrade` entry point compiled successfully.
- Live checkout, restore, browser rendering, and deployed account state have not been exercised. No production deployment was performed.
