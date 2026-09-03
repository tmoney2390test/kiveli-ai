# Mobile private adult-dialogue compliance

Status: implementation reference, reviewed against the linked Apple and Google policies on 2026-09-02. This is not legal advice and does not guarantee store approval. The desired native explicit-text capability carries a material rejection risk under both stores' sexual-content rules; an 18+ rating, truthful disclosure, and safety controls do not override those substantive rules.

## 1. Final capability matrix

| Capability | Web | iOS | Android |
| --- | --- | --- | --- |
| Private standard or mature text | Yes | Yes | Yes |
| Private consensual explicit fictional-adult text | Yes, when eligible | Yes, when eligible | Yes, when eligible |
| Private direct or all-adult group explicit text | Yes, when eligible | Yes, when eligible | Yes, when eligible |
| Explicit image or video generation | Existing separately gated website policy | No | No |
| Explicit voice/audio | Existing non-explicit voice policy | Not expanded | Not expanded |
| Explicit public characters, posts, conversation shares, discovery, or store media | No | No | No |
| Explicit notification, widget, or live-activity text | No | No | No |
| Illegal, exploitative, non-consensual real-person, or minor sexual content | No | No | No |

The central, deterministic resolver is `packages/together-domain/src/platform-content-policy.ts`. Private text is allowed only for private scope, an adult-eligible authenticated account, confirmed-adult fictional participants, and an allowed prohibited-content safety decision. The surface is not a subscription input. Surface identity still controls explicit media.

## 2. Adult-eligibility rules

- Signup and age confirmation accept a birthdate through authenticated server functions, reject users younger than 18, and persist `date_of_birth`, `age_verified_at`, `adult_eligible_at`, and versioned method `self_declared_dob_v2`.
- Every direct/group setting, generation, regeneration-compatible turn, and restricted-history projection reloads the authenticated profile. A chat body or local preference cannot assert adulthood.
- A stored birthdate that is under 18 overrides stale eligibility timestamps. Unknown, malformed, expired, restricted-region, or restricted-account status fails closed.
- Birthdate is not returned in normal client snapshots or emitted to analytics. Account switching creates a new authenticated server lookup; sign-out clears app state.
- Support is the correction path for an incorrectly recorded age. Do not silently let a user edit birthdate after eligibility was established without a reviewed re-verification flow.
- `self_declared_dob_v2` is minimal self-declaration, not a claim of jurisdiction-wide age-verification compliance. Preserve the replaceable method/reference fields for stronger assurance.

## 3. Direct-chat behavior

Flow: authenticated request → server profile/eligibility → owned private conversation → current character record → character adulthood → stored boundary normalization → input safety → platform policy → provider route → prompt → output safety → message metadata/persistence → neutral list/push preview.

`Standard`, `Mature`, and `Explicit` appear under the restrained “Conversation boundaries” control. Explicit is available only after account eligibility, applies only to private text, and is revalidated server-side against the current character. The prompt preserves character identity, memory, relationship/world state, user agency, reversible consent, and authored boundaries. It never treats Explicit as automatic sexual availability or speaks for the user.

Versioned message metadata and migration `202609020005_kivelle_private_adult_text_projection.sql` keep approved private adult text distinct from web-only explicit media and unclassified legacy content. History, search, quoted replies, semantic recall, open threads, and derived private memories admit explicit rows only when both the current eligibility check and the trusted `private-adult-text-v1` policy marker are present. Losing eligibility returns the same timeline to its neutral safe projection.

## 4. Group-chat behavior

The group route independently loads every active participant before generation. A participant is eligible only with a numeric age of at least 18 and no conflicting youth-coded canonical description. Missing, minor, ambiguous, or youth-coded status makes the entire current group non-explicit. The roster is reloaded for each responding speaker, so adding/removing a participant or changing canonical age data immediately changes the decision without a cached eligibility grant.

Existing Group Energy, “Who responds,” speaker count, message style, dynamism, and reasoning controls remain separate. Each speaker keeps individual knowledge and consent boundaries; Explicit does not increase speaker count or make every character interested.

## 5. Native media restrictions

- Native and unverified-direct requests are classified `native_or_unknown` by the server. Explicit image/video policy is denied before provider execution.
- The existing website gateway is the only surface that can receive a signed web assertion. Caller-supplied surface headers are stripped and replaced with a user/path/method/time/nonce-bound HMAC.
- Website explicit assets additionally require the separate website kill switch, adult media flag, current media entitlement/credits, adult eligibility, eligible fictional subjects, an unexpired HttpOnly web session, moderation, and short-lived one-time asset grants.
- Private-text eligibility never authorizes media. Automatic offers, edits, group selfies, proactive/background jobs, polling, and asset fetches continue through the existing media policy and final authorization checks.
- Native clients contain no adult asset client. A generic safe state is used rather than a thumbnail, blur, URL, prompt, caption, OCR, or derived explicit description.

## 6. Public/shared-content restrictions

The central resolver rejects explicit `public_character`, `public_post`, and `conversation_share` capabilities on every surface. Custom companions remain private drafts in the current creator flow; public catalog data is authored/published separately. Future publish/share endpoints must call the same resolver and rerun moderation—private message metadata alone is never publication authorization. Discovery art, public group templates, deep-link previews, and store screenshots remain SFW.

## 7. Subscription separation

Adult eligibility is not present in `subscriptionCatalog`, `entitlementKeys`, feature comparisons, or checkout copy. The retired `explicit_dialogue_unlimited` testing grant is ignored by current code and removed from stored entitlement rows by migration `202609020004_kivelle_private_adult_text_entitlement_cleanup.sql`.

Free and paid verified adults receive the same content-policy decision. Existing plan rules may still change daily messages, model quality, reasoning, memory, active conversation/group limits, voice, media credits, and queue priority. Subscription expiration changes those product limits but not adult eligibility.

## 8. AI-reporting flow

Every direct and group assistant bubble has an in-app report action. The modal accepts minor safety, non-consensual/exploitative content, real-person privacy, threat/harm, harassment, unexpected sexual content, or another reason plus optional detail. Submission does not navigate away or publish content. Duplicate open reports are idempotent; severe categories create a structured safety escalation. The linked message remains private and reviewers receive only the reported response plus the details the user provides, not unrelated history by default.

## 9. Notification and device privacy behavior

Push bodies use only “You have a new message from {Character}.” Raw dialogue is never accepted by the payload builder or analytics event. Conversation-list previews come from the safe database preview trigger and use “Private exchange” for restricted runs. App contents are covered by a neutral Kivelle screen when a native app becomes inactive/backgrounded. No widget or Live Activity is configured for dialogue.

## 10. App Store Connect checklist

- Select the highest truthful age rating generated by the current questionnaire; declare age assurance, messaging/chat, AI/creator or UGC capabilities where applicable, mature/suggestive themes, sexual content, and profanity at their actual frequency.
- Do not mark Made for Kids. Confirm every regional rating/availability requirement separately.
- Declare that AI text can contain detailed adult sexual dialogue. Do not rely on an 18+ result to cure Apple Guideline 1.1.4; obtain written specialist review before submission because Apple expressly bars overtly sexual or pornographic material, including explicit descriptions intended to stimulate erotic feelings.
- Verify the in-app report flow, published support contact, content filtering, account deletion, privacy-policy URL, retention/deletion statements, and accurate data-use disclosures.
- Keep discovery, onboarding, screenshots, subtitle, keywords, promotional text, subscription cards, and review credentials production-equivalent and broadly positioned around living worlds and fictional relationships.
- Suggested store positioning: “Explore living AI worlds, meet evolving fictional characters, build relationships, uncover stories, and create personalized adventures.” Do not use adult, NSFW, uncensored, sexting, porn, or sexual-character keywords.
- Subscriptions must describe messages, models, memory, companions/groups, voice, media credits, and priority only.

## 11. Google Play Console checklist

- Exclude children from target audience and complete the IARC/content-rating questionnaire with the actual strong language, sexual themes/text, chat, and generative-AI behavior.
- Complete AI-generated-content declarations and verify in-app reporting/flagging without requiring users to leave the app.
- Review Google’s Inappropriate Content rule before every release. Google states that apps containing/promoting sexually gratifying content and generative-AI apps primarily intended to be sexually gratifying are not allowed. Age screening and an adult rating do not override that rule; the intended feature has material Play rejection/removal risk.
- Complete Data Safety for account data, conversations, uploaded/generated media, audio/transcripts, analytics, diagnostics, billing, notifications, and all SDK/provider processing. Keep it synchronized with the privacy policy.
- Confirm account deletion exists in-app and at a functional external web resource; disclose legitimate retention exceptions.
- Keep store title, short/full descriptions, screenshots, tags, recommendations, and subscription products SFW and focused on interactive worlds/relationships.
- Use production-equivalent review credentials and disclose native explicit text plus the explicit image/video block. Do not create reviewer-only behavior.

## 12. Suggested Apple review notes

> Kivelli is an age-restricted AI character and interactive-world platform. Adult users can engage in private, user-directed text roleplay with fictional adult characters, and that private text may become sexually explicit when the authenticated user and every fictional participant are confirmed adults and prohibited-content moderation allows it. The app does not provide explicit image or video generation on iOS. Public/shared content and discovery are separately moderated and do not allow explicit material. Kivelli prohibits sexual content involving minors, ambiguous or youth-coded characters, exploitation, trafficking, sexual violence, illegal activity, and non-consensual intimate content involving real people. AI responses can be reported in-app, notification bodies are neutral, and subscriptions purchase general service capabilities rather than adult eligibility. Review credentials below use the same production policy as every user.

Do not soften this disclosure. Apple may decide the private text violates Guideline 1.1.4; if so, the compliant response is a product change or alternate distribution strategy, not concealment.

## 13. Suggested Google review notes

> Kivelli is an adults-only fictional AI world and relationship application. Authenticated adult users may direct private text conversations with confirmed-adult fictional characters, including mature or explicit text. Android blocks explicit image and video generation. Public/shared content, discovery, notifications, and store assets remain non-explicit. Server-side policy checks age eligibility, every current group participant, conversation privacy, and prohibited categories on each turn. Each AI response can be reported in-app. Subscriptions cover general usage, models, memory, voice, groups, and media credits; they do not unlock adult eligibility. The supplied account and production reviewers receive identical behavior.

Google may still find the capability inconsistent with its Inappropriate Content or AI-generated-content policy. Do not claim age restriction is an exemption.

## 14. Test-account instructions

Create a dedicated production-equivalent reviewer account through the normal signup flow and store credentials only in App Store Connect/Play Console secure review fields—not this repository. Confirm the account is 18+, onboarding is complete, and it has at least one confirmed-adult direct character and one all-adult group. Review path:

1. Sign in normally and open the supplied direct chat.
2. Open `…` → Conversation boundaries; verify Standard, Mature, and Explicit.
3. Select Explicit and send the neutral scripted policy test provided privately to the reviewer; do not put explicit sample text in screenshots or store metadata.
4. Report the assistant response from its message menu and confirm the in-app acknowledgement.
5. Open the supplied all-adult group and repeat; then add the supplied unknown-age test participant and confirm Explicit becomes unavailable/downgraded.
6. Attempt an explicit image and video request on native and confirm a neutral denial before any provider job.

Never detect this account, its email domain, IP, build, or review timing in runtime code.

## 15. Feature flag and rollback instructions

`KIVELLE_PRIVATE_ADULT_TEXT_MODE` is server-only:

- `off`: preserve stored boundary preferences, generate non-explicit dialogue, no raw-content shadow logging.
- `shadow`: calculate policy eligibility and store structured counts only; still generate non-explicit dialogue.
- `on`: apply eligible explicit private text on web/iOS/Android.

Deploy code and migration with `off`, observe `shadow`, then enable `on` only after legal/store/provider approval. Emergency rollback is a single server-secret change back to `off`; canonical history and preferences are not deleted. `WEB_ADULT_MODE_ENABLED` rolls back website explicit media independently. Provider flags may disable xAI, but may never bypass policy. Flags apply identically to reviewers and ordinary users.

Structured event fields are surface class, direct/group mode, requested mode, allow/shadow/block, reason code, all-participants-adult result, provider route, and policy version. Analytics excludes raw prompts, replies, birthdates, assets, and URLs.

## 16. Known residual policy risks

1. **Very high store-policy risk:** Apple Guideline 1.1.4 bars overtly sexual/pornographic material and Google bars sexually gratifying apps/content; Google’s AI guidance specifically lists primarily sexually gratifying generative-AI apps as violative. The intended native explicit-text experience may be rejected even with every technical safeguard.
2. **Age assurance:** self-declared DOB is not guaranteed to satisfy every jurisdiction or store expectation. Obtain counsel and add jurisdiction-aware age assurance before broad rollout.
3. **Native attestation:** the backend cryptographically proves web but currently groups direct native traffic as `native_or_unknown`; that is safe because iOS and Android have identical rules. Add App Attest/Play Integrity or equivalent before relying on different native capabilities.
4. **Provider acceptance:** confirm the explicit dialogue provider contractually permits the intended content and retention settings; a configured key is not legal/provider approval.
5. **Public publishing:** current custom companions are private drafts and no public conversation-share workflow is exposed. Any future publishing/share implementation must invoke the central deny policy and separate moderation before launch.
6. **Moderation error:** context-aware classifiers can miss or over-block. Maintain severe-report response SLAs, audit structured failure rates, and fail closed when age, participant, or safety state is uncertain.
7. **Legal text:** repository copy is an engineering alignment, not executed legal advice. Counsel must approve Terms, Privacy, retention, age assurance, regional availability, and incident reporting.

## 17. Official policies reviewed

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — especially 1.1.4 objectionable sexual content, 1.2 UGC/creator-content controls, 2.3 accurate metadata, 3.1 payments, and 5.1 privacy/account deletion.
- [Apple age-rating values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions) — age assurance, messaging/chat, mature/suggestive, sexual content/nudity, and graphic sexual content categories.
- [Google Play Inappropriate Content](https://support.google.com/googleplay/android-developer/answer/9878810?hl=en) — sexual content/profanity, sexually gratifying services, exploitation, non-consensual content, and store-listing examples.
- [Google Play AI-Generated Content](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en) — prohibited-output controls and mandatory in-app AI reporting.
- [Google Play AI policy explanation](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en) — chatbot scope and sexually gratifying generative-AI risk.
- [Google Play User Generated Content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) — terms, moderation, reporting/blocking, minor restriction, and incidental-content controls where applicable.
- [Google Play User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en) and [Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) — privacy, deletion, retention, SDK/provider, and disclosure requirements.

This architecture contains no review-account, review-IP, delayed post-approval, build-specific concealment, or reviewer-only clean-mode logic. Legitimate operational flags are global and production-equivalent.
