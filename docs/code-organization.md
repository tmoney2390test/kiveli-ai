# Code organization and incremental cleanup

The first cleanup pass separates client request handling and direct-chat presentation without changing endpoint contracts, model selection, billing rules, or the Safari composer layout. Existing imports from `src/lib/api.ts` remain supported. No database migration or production deployment is part of this pass.

| Area | Implementation owner | Rule for new work |
| --- | --- | --- |
| HTTP requests, authentication and API errors | `apps/together/src/lib/api/transport.ts` | Reuse the transport; do not add feature endpoints here. |
| Client performance events | `apps/together/src/lib/api/telemetry.ts` | Keep diagnostics out of the critical path and exclude private message content. |
| Direct replies and group replies | `apps/together/src/lib/api/dialogue.ts`, `groups.ts` | Keep stream protocols and committed-message recovery explicit. |
| Voice, media, uploads, plans, places, memory, creator, account and catalog operations | Corresponding modules in `apps/together/src/lib/api/` | Import the owning module directly. Preserve request IDs, consent checks and server error codes. |
| Compatibility exports | `apps/together/src/lib/api.ts` | Re-export only. Do not import this facade from its implementation modules. |
| Direct-chat presentation | `apps/together/src/features/chat/components/` | Pass state and actions through props. Do not import a route implementation. |
| Timeline composition | `apps/together/src/features/chat/timeline.ts` | Preserve call grouping, unread boundaries and resolved-proposal behavior. |
| Direct history and lifecycle | `apps/together/src/features/chat/useDirectConversationHistory.ts` | Own initial/cache loads, pagination, realtime invalidation, resume and completed-turn refresh. Merge canonical pages without replacing in-flight replies. |
| Group catch-up and pagination | `apps/together/src/features/chat/useGroupTimelineRefresh.ts` | Serialize deltas, bound full-read fallback and preserve older pages. Keep group-specific speaker rules separate. |
| Group initial and resume reads | `loadGroupConversation.ts`, `useGroupConversationLoad.ts` in the chat feature | Coalesce scoped reads, cancel hidden-tab waits and retries, reject stale results, and preserve the visible timeline during resume. Never replay a message. |
| Request ownership and reply admission | `requestScope.ts`, `useChatRequestScope.ts`, `authorizeReply.ts` in the chat feature | Scope work to the mounted account, Life and conversation. Acquire the reply lock before awaiting cost authorization. |
| Interrupted replies | `apps/together/src/features/chat/recoverPersistedReply.ts` | Poll durable history with the original request ID; do not resend or recharge during read recovery. |
| Gallery and image uploads | `useConversationGallery.ts`, `uploadConversationImage.ts` in the chat feature | Share direct/group loading and upload phases. Ignore stale results and stop subsequent upload steps after leaving the session. |
| Route orchestration | `apps/together/app/chat.tsx`, `group-chat.tsx` | Still coordinate plans, actions, billing UI and composer layout. Further extraction should proceed one responsibility at a time. |

The existing hooks for drafts, rewriting, dictation and mobile keyboard positioning remain in use. The unused legacy composer and commented legacy planner were removed. Message rendering, voice playback, gallery presentation, notices and header components were moved with their existing styles and callbacks.

The second pass fixes late-response races in history pagination, group resume, galleries, interrupted-reply recovery and photo upload preparation. A request lease is invalidated on account/Life/conversation changes and unmount; returning to the same route does not revive its old lease. Gallery reloads use latest-request ownership, while pagination and reply admission reject duplicate concurrent actions. Releasing an old lease cannot unlock a newer action. Group state and direct history also hide the previous scope immediately, before asynchronous effects run.

Private direct/group warmups now check that they still own their cache entry before writing or removing an in-flight entry. Clearing private caches during sign-out or Life switching therefore cannot be undone by a late warmup response. A late completion also cannot remove a new session's in-flight request. Direct focus, resume, realtime and completed-turn reads use the same coalescing warmup path. Older-page availability is preserved during subsequent latest-page refreshes.

The second-pass app suite passes 1,008 tests across 193 files, including 20 added tests for request ownership, concurrent authorization, recovery, uploads and cache invalidation. Source comparison confirms that the chat keyboard/composer layout props are unchanged; this is not physical-device verification. No provider selection, adult-content policy, credit allocation, database schema or endpoint contract changes are part of this cleanup.

`pnpm architecture:check` enforces boundaries for the API modules and extracted chat feature. It rejects implementation code in the API facade, imports back into that facade, UI/store dependencies from API modules, route imports from chat features, and runtime cycles within the checked modules. It also rejects runtime imports of the broad components barrel throughout the client. Import the component's owning file so Metro can keep unrelated UI out of the shared entry chunk. The check does not claim to audit the entire repository dependency graph. Its regression suite and web-budget regressions are included in `pnpm test` and can run independently with `pnpm architecture:test`.

`pnpm format:modules` and `pnpm format:modules:check` scope formatting to the migrated code. CI pins Deno 2.9.5 for repeatable formatting. Existing files outside that scope are not reformatted as part of unrelated fixes.

CI runs application checks, Edge checks, database contracts, web export and native asset export in parallel. The existing `verify` job remains the final gate and fails if a required job fails, is cancelled or is skipped. The database workflow is reusable and manually runnable; its duplicate contracts no longer run in the application job. All commands from the previous two workflows remain represented. If repository protection separately requires the old standalone database status, update it to the reusable database job or the aggregate `verify` status before merging.

The third pass replaces broad component imports in 55 files with imports from their owning modules. AST comparison confirms unchanged implementations in 53 of those files; the other two have the account-cache correction described below. Legacy upgrade, profile, onboarding and quick-start URLs lazily render their existing screens in place, preserving query parameters and avoiding restored-route redirect loops. No chat composer or keyboard layout was changed.

Background route warmup is limited to Home, inbox, Explore and Moments. It runs progressively during browser idle time, pauses in hidden/offline tabs and on data-saver/2G connections, and cleans up timers/listeners on unmount. Intent-driven warmup still runs when a user chooses a destination. Failed prefetches are retryable; an old rejection cannot invalidate a newer attempt. World Pulse resume reads now use the same two-minute cache policy as focus reads and coalesce concurrent requests. Expiry still uses elapsed monotonic time against server time, including an immediate check on resume.

Membership query keys now include the authenticated account ID. Fresh results are reused when another panel opens; explicit refresh and native purchase invalidation remain available. Checkout confirmation and creator credit-balance updates target the same scoped key. Sign-out removes membership queries, and a late removed-query response cannot repopulate them. This changes client cache ownership, not server entitlements, pricing or credit allocation.

The web budget runs against `apps/together/dist-web`, matching CI. It is now **blocking**, with the unchanged 1.05 MiB gzip limit applied separately to the entry page, Home and Explore. It includes shared scripts, deduplicates repeated script references, and fails incomplete exports instead of silently excluding missing chunks. The largest-static-asset limit remains 2.25 MiB.

October 3 validation export, gzip bytes (level 9), measured before and after this pass:

| Route | Before | After |
| --- | ---: | ---: |
| Entry | 1,135,731 | 1,071,678 |
| Home | 1,150,284 | 1,086,224 |
| Explore | 1,147,535 | 1,083,495 |
| Direct chat | 1,188,918 | 1,136,509 |
| Group chat | 1,173,005 | 1,110,802 |

Entry is down approximately 5.6%; this measures transferred script size, not device startup latency. Chat routes are reported here but are not part of the startup-budget gate; further chat-only splitting remains useful. The final entry, Home and Explore sizes are 1.022, 1.036 and 1.033 MiB gzip. The largest asset is 1.24 MiB. Exports made with CI placeholder Supabase settings are build validation artifacts, not deployable production builds.

The third-pass `pnpm test` run passes 1,021 app tests across 195 files and 1,210 domain tests, plus the gateway/content/audit checks and 11 architecture/budget tests. A final native-global regression brings the app suite to 1,022 passing tests. Lint, application/domain typechecks, architecture checks, web export/budget, and iOS/Android JavaScript/asset exports pass. Native assets total 35,101,334 bytes under the existing 37,748,736-byte budget. The new behavior tests cover cache isolation, late responses, fresh/stale reads, expiry under clock changes, preload cancellation and constrained connections. Physical iPhone checks and live authenticated browser testing remain outstanding; no deployment or signed native build is part of this pass. Edge and database checks were not rerun because this pass changes neither layer.

The fourth pass extracts group initial/resume loading into a read helper and a small lifecycle controller. Initial errors and loading state are account/Life/conversation scoped. Leaving the screen cancels hidden-tab waits and retry delays as well as the transport. A late response cannot update the screen or cache; a new mount can recover from a coalesced request cancelled by its predecessor. Resume is debounced and preserves the visible timeline on failure.

Full group refreshes now retain photos, reactions and pagination belonging to older loaded messages. Missing rows inside the refreshed message window remain authoritative removals, and dismissed actions are not restored. Older snapshots and wrong-conversation deltas cannot roll the sync cursor backward. When the cached and latest message windows no longer overlap, refresh keeps the latest contiguous page and allows older paging to fill the gap instead of presenting disconnected windows as complete history. Pending local messages remain visible.

Message reconciliation now skips serialization when the old and new message are the same object. An isolated desktop Node benchmark with 1,500 messages and a 30-message unchanged refresh measured a median 5.36 ms before and 2.64 ms after across 21 runs following warmup. This measures the helper only, not phone responsiveness or network latency.

Fourth-pass verification: the final app suite passes 1,048 tests across 197 files, including cancellation, cache ownership, resume failure, stale snapshots, older media retention and disconnected-history coverage. The full repository test run also passed 1,210 domain tests and its gateway/content/audit/architecture checks before the final history-gap regression was added; the entire app suite was rerun after that addition. Lint, application/domain typechecks, the 740-file architecture check and the 47-file scoped formatting check pass. Web export and its entry/Home/Explore budgets pass at 1.022/1.036/1.034 MiB gzip. iOS/Android JavaScript and asset exports pass; native assets remain 35,101,334 bytes. Source comparison confirms all 39 top-level group-chat JSX trees and the direct-chat route are unchanged from the start of this pass. Controller tests exercise callback lifecycle behavior, not a native renderer. Physical iPhone and authenticated browser checks remain outstanding. This pass includes no deployment, signed native build, Edge changes or database changes.

The fifth pass guards direct and group photo-offer decisions and plan mutations with conversation-scoped request ownership. A fast second tap cannot start a duplicate client action, and late results from a previous account, Life or conversation cannot update the current chat. Confirmed plan suggestions leave the pending timeline immediately; a failed dismissal restores its card.

Declining a user-requested photo now prompts a text reply to the original message in direct and group chat. The Edge functions verify the declined offer, original user message and latest photo placeholder; retries use the same request identity. The continuation is hidden from the timeline, preserves the composer draft, skips a second free user-message count, and does not replay life or relationship effects from the original request. Group summaries omit the hidden control message. These changes do not change the photo gate or content policy.

Fifth-pass verification: the full repository test command passed before the final retry fixture was added; the final application suite passes 1,051 tests across 197 files. Lint, application and Edge typechecks, the focused two-case Deno test, web export and bundle budget pass. No database migration or production deployment was made. Authenticated browser and physical-device behavior remain to be checked before a native release.

Continue cleanup in this order:

1. Continue extracting the remaining plan/action orchestration behind behavioral tests. Preserve keyboard behavior, draft persistence and account/Life isolation. Group orchestration remains separate where speaker and witness rules differ.
2. Separate Edge dialogue admission, context preparation, generation, streaming and finalization while preserving existing database transaction boundaries. Provider retries must not replay committed effects.
3. Split shared database, API and UI types; introduce runtime validation for critical response contracts and tighten lint rules module by module.
4. Continue measuring route/catalog loading and broad snapshot subscriptions. Keep startup below the now-blocking budget and split remaining chat-only settings/planning dependencies based on measured chunk ownership.
5. Add an isolated full Supabase migration/pgTAP gate and browser smoke tests. The current database workflow runs SQL contract tests; it does not replace full migration testing or physical iPhone keyboard checks.

For each extraction, run relevant behavioral tests, lint, application/domain typechecks and the web export. Changes to Edge or database code additionally require their own checks. Validate direct/group chat, message actions, media viewing and audio on native devices before the next native release. Smaller files and passing unit tests alone are not evidence of improved runtime latency or device behavior.
