# App Privacy / Data Safety worksheet

This is an implementation-derived worksheet for the account owner. Verify provider contracts, legal entity, retention, and store definitions before publishing answers.

| Data category | Why Kivelle uses it | Typical recipient/storage | User control |
|---|---|---|---|
| Account identifiers and email | Authentication, recovery, entitlement association, support | Supabase Auth/database; Apple/Google during their sign-in | Sign out, support, export, delete |
| Birthdate/adult-eligibility timestamps | Adult-only account eligibility and content policy | Kivelle database | Review policy; delete account |
| Conversations and selected memories | Generate contextual replies and continuity | Kivelle database; enabled dialogue/analysis provider only after recorded AI-sharing consent | Conversation/memory controls; withdraw AI sharing; export/delete |
| User-selected photos | Private photo sharing, vision description, optional generation reference | Private Kivelle storage; enabled vision/media provider after consent | Remove attachment/message; expiry/cleanup; delete account |
| Generated media | Deliver requested private media and maintain gallery/history | Private Kivelle storage; configured generation provider | Delete media/message/account |
| Audio chosen by the user | Transcription, TTS, or current voice features | Enabled speech provider after consent; Kivelle session records as implemented | Feature controls; withdraw AI sharing; delete account |
| Purchases and entitlement IDs | Verify access, grants, renewals, refunds, restore | Apple/Google, RevenueCat, Kivelle normalized billing tables; legacy Stripe where applicable | Store management, support, deletion marker/reconciliation |
| Push token and installation ID | Deliver opted-in discreet notifications | Expo push service and Kivelle push tables | OS permission; Kivelle notification setting; per-installation deactivate |
| Operational diagnostics | Reliability, fraud/safety operations, support | Kivelle sanitized analytics/ops tables and configured alert destination | Analytics setting where applicable; support; delete subject to documented retention |
| Safety report and minimum selected context | Review a user-submitted safety issue | Restricted Kivelle reviewer queue | Reporter can submit; staff access is role/audit controlled |

Actual AI provider identities currently disclosed by the implementation are OpenAI, Google, xAI, Venice AI, WaveSpeed AI, and ElevenLabs. A specific request reaches only the provider selected for that feature. The code does not make a provider training or retention promise; contract/DPA and regional-processing answers are owner inputs.

Before store submission, the owner must confirm: legal entity/contact; privacy-policy URL; exact production providers enabled; account-data retention periods; whether diagnostics are linked to identity under each store definition; encryption/export representations; child-directed status; tracking/advertising status; data-sale/sharing definitions; and deletion timing. Do not infer these from this worksheet.

