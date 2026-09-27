# Account popup and mobile membership release

Source: ecb1878. Web Worker: 37b8a529-b635-4f03-b91f-23533974dd86. Previous Worker: 5ca1c8e5-0714-4363-93a2-25b9f8d388c0. Shared bundle: 91def1964478d8d984aea264a24ebd9f.

The mobile home avatar and desktop rail account button open a shared account popup. Includes the private account avatar/profile link, Create companion, Plans & credits, live balances, Personas & Lives, Memory Center, Relationships, Privacy, Help, and All settings. Existing destination pages and purchase rules are retained. Sheet scrolls within safe-area bounds and supports backdrop, close, Escape, and native request-close dismissal.

Membership fix: content-based flex sizing for vertically stacked plan/credit columns and mobile cards, wrapping price/button text, shrinking heading text alongside icons, and removal of the discovery hero's forced mobile minimum height. Desktop card flex remains unchanged.

Verification: app typecheck and 903 tests passed. Production export succeeded; the standalone verifier required explicit loading of the pulled production environment after Expo exited, then passed. Live audit passed 423 routes and 63 critical assets. At 390x844, reproduced the old membership text overlap and blank panel, then visually confirmed the deployed repair, lower benefit/wallet layout, and account popup. Clicked Create companion and Plans & credits from the popup and verified destinations. No purchases, messages, resets, or companion creation submitted. Browser viewport override reset afterward.

No new iOS/Android binaries or backend functions deployed. Installed native apps need a separate release to receive these source changes. Support/recovery expansion remains a plan in support-recovery-expansion-plan-2026-09-16.md, not a new recovery guarantee. Existing unrelated navigation audit findings remain outside this change.
