# Launch readiness review — 15 September 2026

## Recommendation
Continue controlled testing; do not call the public native launch ready yet. The next work should be reliability, store completion and release verification, followed by performance and usability polish. This review made no policy, pricing or product changes beyond deploying the already-authorized creator work.

## Deployment completed
- Source: d8ce5f2, including 9548fd0 and 47ea6c9; pushed to fix/world-selector-release-order.
- Web Worker: f9180d57-4ce5-4de9-a022-a74514c614f9. Rollback reference: c746dcfa-bb52-4ba6-8f77-f03f6d7ecf4a.
- together-creator: ACTIVE v161. Applied the creator delta to the downloaded v160 bundle, retaining independent live edits and adding missing dependencies. Existing handler authentication and JWT setting preserved. No migration required.
- Live common asset: __common-96d57445a4f122039ac9378e3e94da57.js.
- All 423 exported page routes and 63 critical assets passed the production audit. Authenticated creator listing: 200; three-activity schedule preview: 400 with the required four-activity explanation; unauthenticated request: 401.
- Predeployment checks: 1,144 domain tests, 898 app tests, eight focused Deno tests, app typecheck, creator endpoint typecheck and production export passed. These are automated checks, not a physical-device acceptance claim.
- No mobile binary built or submitted in this deployment. No paid generation, purchase, account deletion or external message sent for this review.

## Priority 1: remove verified reliability problems

### Optional dialogue planner repeatedly times out
Live usage records for the last seven days contain 89 director_openai calls, all NETWORK_OR_TIMEOUT; the last 24 hours contain 11 calls, all failed. Mean recorded latency is approximately 3,019 ms. Current kivelle-director.ts gives the entire provider sequence a three-second deadline, calls OpenAI first, then considers Gemini only if time remains. Its circuit breaker is process-local. This is strong evidence that the optional stage frequently adds delay without an AI planning result; it does not mean 89 customer messages failed, because a deterministic brief remains available.

Next: measure the actual configured model/request against that deadline, use a provider/model request that reliably fits it, reserve time for any fallback, and move optional enrichment off the critical path where possible. Do not merely extend the wait. Verify p50/p95 time-to-first-response on ordinary and high-memory conversations, and record fallback rates. Preserve NSFW routing and memory rules.

### Client lifecycle and release consistency
Ops currently contains 80 open incidents labelled critical and 37 warning incidents. These are incident records, not unique affected users or 80 current crashes. Recent examples include an unknown-module error in the creator on September 15, repeated inbox Realtime callback-after-subscribe errors on September 14, and released Android audio player/recorder handles on September 14.

Current chat-tab.tsx uses a fixed channel name and asynchronous removal during effect cleanup. Investigate remount/cleanup overlap and subscription ownership; the causal diagnosis still needs reproduction. Reproduce unknown-module errors across a deployment with an already-open tab before attributing them to cache/version skew. Test audio navigation and foreground/background transitions on the actual Android build. Close historical incidents only with a build-specific verification, and group future incidents by release, platform and stack fingerprint.

Acceptance: repeated chat-list/chat switching, logout/login, account switch, interrupted audio, and an old open browser tab crossing a release do not crash or duplicate subscriptions/messages.

### A visible story destination is missing
apps/together/app/scenarios.tsx links to /stories/the-last-night-in-vespormoor, but no corresponding route exists. A live request redirected to /home. Restore the intended campaign route or remove the invitation until it is available. The exported-route audit cannot detect destinations that were never exported; add navigation-link coverage.

The navigation audit also flags MomentQuickMenuButton. Manual source inspection confirms it has its own onPress and an onSelect callback; this finding is an audit false positive, not evidence of a broken button. Teach the audit that component contract rather than adding a redundant handler.

## Priority 2: finish native launch requirements

Apple API inspection now confirms build 15 is VALID and IN_BETA_TESTING internally; external state is READY_FOR_BETA_SUBMISSION. The local release completion record says Android 14 submission completed. That record is not a fresh Google approval check. Both candidates are recorded against source 4e78605 and therefore predate this creator release and subsequent client work.

Current Apple beta reviewer username/password fields are empty. The inspected credit product (6812030024) and subscription (6807826875) are MISSING_METADATA, and both review screenshot relationships are empty. Complete real purchase-screen evidence and reviewer access, then check every product and the full public listing, privacy declarations, age rating and review notes. Do not infer all products are ready from one passing product. Browser Apple authentication had expired, but existing authorized API access supplied these current findings.

The Apple revocation configuration was added earlier today; the September 10 document saying it is absent is stale. A real Apple sign-in/token exchange/deletion/revocation still lacks device evidence. Do not perform destructive testing on the owner's account.

Run the final source on physical iOS and Android devices before broad release:
- Fresh install, email and Apple/Google sign-in, recovery, four-step onboarding, membership entry and correct return navigation.
- Sandbox subscription and each credit pack; cancel/pending/interrupted purchases; relaunch and restore on another device; renewal/refund/expiry; exactly-once ledger grants.
- Keyboard visibility, safe areas, chat back/list behavior, persona switching, video playback/fullscreen and microphone/photo permission denial.
- Account deletion, consent withdrawal, private media restrictions, push taps and quiet-hours/backoff.
- Accessibility at large text sizes, screen reader labels, reduced motion, offline/reconnection and poor networks.

### Store content-policy risk remains a product decision
Existing native private explicit text behavior remains unchanged. Apple guideline 1.1.4 includes explicit sexual descriptions; Google Play's inappropriate-content policy also covers sexual content. Blocking native explicit images alone does not settle the text issue, and a mature age rating does not establish acceptance. This is a material review risk, not a prediction that a particular review will fail. Resolve the intended distribution policy openly before public submission; do not hide behavior from reviewers.

Sources checked for this review: https://developer.apple.com/app-store/review/guidelines/ and https://support.google.com/googleplay/android-developer/answer/9878810 .

## Priority 3: production operations and trust

Healthy evidence today:
- All 13 wallets match their ledger totals; no negative balances.
- The earlier September 15 credit audit exercised rollover caps, monthly annual-plan grants, replay/refund deduplication, expiry and failure refund recovery. No active annual subscribers were available for a real renewal test.
- Email outbox: three sent, zero pending/failed. This proves application/provider send state, not inbox placement or bounce handling.
- Two support tickets are closed and have first-response timestamps.
- Seven-day media-provider sample: 17 completed, four failed (three image_quality_failed, one video_quality_failed), no nonterminal jobs in that sample. Provider jobs are not identical to all user requests; this small historical sample does not establish the current failure rate.

Next: test support submission/reply delivery and bounce diagnostics using a disposable test account; confirm alert delivery to a real operator and a tested backup restore into an isolated environment. Keep a single launch dashboard for failed/stale jobs, charge/refund mismatches, purchase reconciliation age, email failures, client errors, response latency and provider costs. Give every alert an owner and recovery procedure. Existing Ops screens alone do not establish that anyone is notified.

Proactive text-generation telemetry (operation name proactive_voice) shows 26 failures of 143 seven-day attempts: 22 output rejections and four timeouts. These are not necessarily audio-call failures or user-visible undelivered messages. Inspect rejected-output reasons and verify the new default-Off/backoff behavior over time. Do not remove quality controls just to improve the metric. Gemini analysis has seven failures of 23 attempts, including two recent 503s; verify retry/recovery so memory processing does not silently stop.

## Priority 4: performance and product polish

The initial web JavaScript is 4.10 MiB raw / 1.03 MiB gzip against a 1.05 MiB gzip budget: passing, but close to the cap. Split optional creator, Ops, media and catalogue code where bundle analysis shows benefit. Measure cold start and chat hydration on a mid-range phone/slow network; this size check is not a Core Web Vitals measurement. Retain old hashed assets long enough for already-open clients or provide a reliable update recovery path if the release investigation confirms stale-chunk failures.

Prioritize complete, understandable paths over new feature count:
1. Clear retry/refund state for generation and network failures; never an indefinite Starting label.
2. Creator AI preview progress, basic-fallback disclosure, venue suitability, work/night-shift interpretation, all activity coverage and three-week review. The live validation path is checked, but a real AI preview has not been exercised in this deployment.
3. Consistent back destinations, modal keyboard behavior, settings navigation, and concise empty states with one useful next action.
4. Web membership acquisition: with Stripe disabled, confirm a new web-only customer has a clear route to supported store purchase and back to their account; unavailable store distribution must not create a dead end.
5. Funnel evidence: signup → onboarding → first conversation → first reply → return visit → purchase. Segment by platform/build/world so recommendations and early-access gating can be evaluated without guessing.

## Suggested release sequence
1. Fix planner latency, reproduce/resolve lifecycle errors and repair the missing campaign destination.
2. Complete purchase/reviewer metadata and approve the intended native content policy.
3. Produce one candidate from a recorded source revision; run the device and sandbox purchase matrix above.
4. Demonstrate alert delivery and restore recovery, then begin a small monitored rollout with explicit rollback criteria.
5. Use real retention, error and latency data to choose further polish; defer major new features until the core loop is dependable.

Limitations: this was a source, production-route, aggregate-database and Apple-API review. It was not a full penetration test, load test, legal opinion, exhaustive visual walkthrough or physical-device/store-purchase test. No production content or policy was changed by the audit.
