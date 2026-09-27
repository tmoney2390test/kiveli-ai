# Kivelli subscription and usage economics — 15 September 2026

## Decision

DeepSeek Pro is deployed as the default eligible NSFW text route. Essential calls now cost 5 credits per started minute; Immersive calls cost 20. Subscription prices and grants remain $19.99/500 credits for Plus and $39.99/1,200 credits for Max. The agreed 250/700/1,750/4,500 credit packs were initially modeled as a proposed catalog and subsequently deployed with user approval on September 15. See pricing-apple-testing-2026-09-15.md for that follow-up release.

Subscriptions can work for light and moderate usage. Heavy mixed use and unrestricted high-volume adult chat can still be loss-making. Annual discounts and low-margin credit redemptions amplify that risk. These are contribution estimates, not verified profit or forecasts of the customer mix.

## What production actually tells us

Read-only aggregates from the Kivelli production database were inspected on September 15. No conversation content or customer-identifying data is included here.

- Seven-day Grok ordinary dialogue: 20 requests, all successful, one account, $0.1831 reported provider cost: $0.009155 per reply.
- Seven-day DeepSeek Pro ordinary dialogue: 13 requests, 12 successful, one account, $0.0603 estimated cost including the failed request: approximately $0.00503 per successful reply. This is about 45% below the Grok sample, but requests were not matched: context, caching, and outputs differ. It is not a controlled benchmark.
- Seven-day paid SFW Luna dialogue: 15 successful requests across three accounts, $0.0241 estimated cost: approximately $0.00161 per reply before supporting operations.
- Thirty-day Essential voice: nine successful sessions, 8.13 connected minutes, $0.0904 pipeline-estimated cost, approximately $0.0111/minute. Too little usage to price solely at this number.
- Thirty-day Immersive voice: ten successful sessions, 18.45 connected minutes, $2.388 estimated audio cost, approximately $0.1294 per connected minute. Input plus output audio totals 29.85 minutes. Text-input events are additional and not covered by that audio-only estimate.
- Twenty-five voice-note events used 4,210 characters, estimated $0.0631. These notes are short; the model below allows 400 characters per note.
- Media estimates vary substantially by model and retry history. For example, historical Qwen Image 2 Edit recorded $3.55 across 70 events and 31 successful events, whereas Grok Imagine Edit recorded $2.76 across 69 events and 57 successes. These are mixed historical routes and intermediate events, not verified unique delivered-photo costs. Do not treat unsuccessful intermediate steps as proof the whole user request failed.
- There are no Plus subscription rows in the inspected billing snapshot, and only three active Max rows across Stripe, RevenueCat, and configured access. These are not evidence of three paying retail customers. Store settlements and sandbox classification were not reconciled.

Accounting gaps: 21 Gemini analysis records in the seven-day sample have no cost estimate; 83 director requests using `gpt-5-mini` failed with `NETWORK_OR_TIMEOUT` and have unknown cost. Null means unknown, not free. These failures also warrant a separate reliability investigation. Essential pipeline totals and voice-call summaries represent the same costs and must not be added together.

## Working assumptions

Thirty-day months, USD, one successful assistant reply is one chat unit. Group chat counts every generated reply, not just each user message. Included context ceilings are 14K for Plus and 20K for Max. Context length is not assumed to reach its ceiling on every turn.

| Unit | Base modeled cost | Stress cost |
|---|---:|---:|
| SFW assistant reply, including supporting-call allowance | $0.002 | $0.004 |
| NSFW assistant reply, including supporting-call allowance | $0.006 | $0.014 |
| Delivered photo, including retry allowance | $0.075 | $0.15 |
| Essential connected minute | $0.025 | $0.05 |
| Immersive connected minute | $0.135 | $0.17 |
| Short voice note, 400 characters | $0.006 | $0.012 |
| Standard 10-second 720p video with sound, 130 credits | $0.60 | $1.20 |
| Premium 10-second 768p video, 200 credits | $0.90 | $1.80 |
| Included date photo | $0.10 | $0.20 |

Supporting calls include memory extraction, embeddings, analysis, scene/director work, and retries. This allowance is provisional because observed accounting is incomplete. An additional $0.25 base / $0.75 stress per account per month covers modeled proactive/background activity. Incremental infrastructure placeholders are $0.25 Free, $0.50 Plus, and $1 Max; they are not measured invoices. Actual load can exceed these assumptions, especially with many Lives, group speakers, long histories, or frequent proactive messages.

Fixed hosting/database/storage/CDN bills, RevenueCat charges, taxes, support labor, refunds, acquisition, and operating salaries are excluded. Subtract actual fixed costs divided by the relevant customer base: a hypothetical $100/month fixed bill is $1/customer at 100 customers and $0.10 at 1,000. Free-user acquisition costs also need allocating to paying customers. Unspent credits and rollover are future redemption liabilities, not permanently avoided costs. One-time 50-credit welcome grants are excluded from recurring months.

## Scenario results after the 5/20 voice change

All media allocations fit the monthly credit grant; none add full voice and full photo redemption of the same credits. Daily included photos are separate, and unused daily allowances are not assumed to bank. The exact allocations and assumptions are in the companion JSON and reproducible script.

| Profile | Replies/day | Base monthly service cost | Stress cost | Contribution at monthly price, 30% fee | Contribution at annual price, 30% fee |
|---|---:|---:|---:|---:|---:|
| Free casual | 5 | $0.80 | $1.60 | -$0.80 | -$0.80 |
| Free daily limit | 20 | $1.70 | $3.40 | -$1.70 | -$1.70 |
| Plus light | 10 | $2.55 | $5.01 | $11.44 | $9.11 |
| Plus mixed | 30 | $8.73 | $17.51 | $5.26 | $2.94 |
| Plus chat-heavy | 100 | $12.75 | $28.25 | $1.24 | -$1.08 |
| Plus photo-heavy | 10 | $8.05 | $16.15 | $5.94 | $3.62 |
| Max mixed | 60 | $19.32 | $37.79 | $8.67 | $4.01 |
| Max heavy mixed | 100 | $30.59 | $62.73 | -$2.60 | -$7.26 |
| Max photo-heavy | 10 | $18.50 | $36.55 | $9.49 | $4.83 |
| Max Immersive-heavy | 30 | $20.00 | $34.15 | $7.99 | $3.33 |
| Max Premium-video-heavy | 30 | $13.93 | $28.00 | $14.07 | $9.41 |
| Max extreme adult chat | 300 | $55.25 | $127.75 | -$27.26 | -$31.92 |

Mixed profiles use 50% adult replies; heavy mixed uses 75%; extreme uses 100%. Plus mixed includes 20 daily-benefit photos, ten purchased photos, 20 Essential minutes, six Immersive minutes, 20 notes, one Standard video, and one date photo (490 credits). Max mixed includes 45 daily-benefit photos, 30 purchased photos, 40 Essential minutes, 19 Immersive minutes, 30 notes, two Standard videos, and three date photos (1,200 credits). The increased voice rates reduce minutes that fit the grant; they do not magically reduce provider cost for identical usage. Users maintaining more minutes need top-ups.

At a 15% fee, monthly contribution improves by about $3 on Plus and $6 on Max; annual monthly contribution improves by $2.50 and $5. The actual applicable fee must be verified. Google lists 15% for auto-renewing subscriptions; Apple Small Business requires eligibility/enrollment. Do not assume 30% is universal or assume enrollment. [Google](https://support.google.com/googleplay/android-developer/answer/112622?hl=en-GB), [Apple](https://developer.apple.com/app-store/small-business-program/).

Chat-only break-even under base costs, before fixed company costs and with no media: at 50% adult replies, approximately 110 replies/day on monthly Plus and 223 on monthly Max with a 30% fee. On annual plans these fall to approximately 91 and 184. For entirely adult replies, approximately 74/149 monthly and 61/123 annual. Group replies count individually. These are operating thresholds, not proposed hidden message caps.

## Voice and the proposed packs

xAI charges $0.08 per minute of audio **sent or received**, plus $0.004 per billable text-input event. A connected minute can contain more than one billable minute when both directions carry audio. This explains the roughly 13-cent connected-minute sample. [Provider documentation](https://docs.x.ai/developers/models/speech-to-speech).

| Proposed pack | Essential retail/min, 5 credits | Immersive retail/min, 20 credits |
|---|---:|---:|
| $4.99 / 250 | $0.100 | $0.399 |
| $11.99 / 700 | $0.086 | $0.343 |
| $27.99 / 1,750 | $0.080 | $0.320 |
| $59.99 / 4,500 | $0.067 | $0.267 |

On the largest proposed pack and a 30% store fee, net is 4.67 cents per Essential minute and 18.66 cents per Immersive minute. At the base assumptions, contribution before fixed costs is approximately 46% and 28% respectively. At stress costs Essential loses money and Immersive has little room. This is a meaningful improvement, not a guarantee. With the old eight-credit Immersive rate, net would be only 7.47 cents/minute—below the provider's single-direction audio rate even before two-way audio and text charges.

Max's 1,200 credits now fund either 240 Essential minutes or 60 Immersive minutes, or a mix with other features. Plus's 500 credits fund 100 Essential minutes or 25 Immersive minutes. No separate unlimited voice benefit is included.

Photo redemptions remain the next pressure point: the largest proposed pack nets 9.33 cents per ten-credit photo after a 30% fee. A 7.5-cent delivered cost leaves only about 20% contribution before fixed costs; 15-cent retry-heavy delivery loses money. Keep final-delivery and failed-attempt accounting together before making further pack discounts.

## Next decisions

1. Keep subscription grants/prices unchanged while collecting representative paid usage. Voice pricing is now corrected; do not expand included benefits yet.
2. Fix missing cost attribution and investigate failed director jobs before interpreting OPS totals as profit. Track actual/estimated/unknown separately.
3. Report cost per successful delivered reply, photo, and connected minute, including all supporting attempts. Reconcile store proceeds and sandbox/internal accounts.
4. Track cohort contribution and p50/p90/p99 spend, including free-user costs and credit liabilities. The current sample cannot establish a safe expected customer mix.
5. Improve caching and selectively run background reasoning. Do not silently downgrade model quality, alter NSFW rules, or introduce undisclosed chat limits to obtain a desired margin.

## Deployment evidence and limits

NSFW-only changes were applied to the downloaded live source, preserving unrelated production code: dialogue v306, group-dialogue v162, dialogue-quote v26, scene-reaction v177 at deployment. Updating environment configuration can subsequently advance function versions. Existing JWT-handler behavior was preserved. Local routing/streaming tests: 32 passing; affected endpoints typechecked.

Voice prices were set in both production configuration variables and live call/subscription source defaults; call v172 and subscription v143 were active after deployment. There were no open call sessions before changing prices. Authenticated `together-call` options returned 5 and 20 and matching remaining-minute arithmetic. Thirteen voice tests passed. Existing apps receive those prices from the server; the immediate local loading-shell defaults were updated in source for the next client release, without building new mobile binaries.

An authenticated ordinary-chat quote returned HTTP 200 and zero included-context credits. Its model remained SFW Luna, confirming ordinary chat was not redirected. No new successful production NSFW generation was observed during verification; the deployed NSFW routing/streaming change has local test coverage, not a claimed completed live NSFW conversation.

