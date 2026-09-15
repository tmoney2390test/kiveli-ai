# Personalized schedule generation

The creator now requests an authenticated, non-persisting schedule preview using the current unsaved identity and life fields. Build requires a typical-week description of at least 20 characters and four distinct activities, enforced on both client and server. New drafts no longer contain a generic prebuilt routine or prefilled typical week. Applying a preview is explicit; another week or changed inputs invalidate an in-flight result.

The provider receives the original concept, biography, job, interests, chosen home/workplace, activity list, routine style, rotating-week index and canonical world locations. Output must cover all supplied activities and all seven days, use known locations, stay within 28 blocks, and have no overlap. Placeholder wording is rejected. Existing moderation and private-text eligibility rules apply; private adult activity labels are placed at home without inventing partners or consent. Romantic/private wording alone does not trigger an explicit-content gate.

AI requests have a 20-second deadline and usage telemetry in Ops. Provider errors or invalid output return a labeled basic fallback with concrete activity labels, job shifts, sleeping/home time and every requested activity. Existing hand-edited schedules and other weeks are preserved until the user applies the preview. No new credit charge is introduced.

Validated: 1,144 domain tests, 898 app tests, eight targeted Deno checks/tests, TypeScript and production web export. No real provider generation was performed during automated validation. Deploy the creator Edge function before the new web client. This pass is committed but not deployed.


## Deployment — September 15
Web Worker f9180d57-4ce5-4de9-a022-a74514c614f9 and together-creator v161 are live. Source d8ce5f2 pushed. 423 routes / 63 assets passed; authenticated listing returned 200, insufficient activities returned the expected 400, and anonymous access returned 401. No new mobile build. See launch-readiness-2026-09-15.md for remaining review findings.
