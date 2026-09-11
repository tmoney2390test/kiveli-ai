# Paid-memory confirmation

Direct and group chat no longer display a persistent context-price banner or fetch
quotes on keystrokes. The first Send after enabling Extended or Maximum memory
opens a confirmation explaining that replies can consume additional Kivelli
credits while the setting remains enabled. Proceed obtains the existing
server-authoritative quote and continues that send; Not now, backdrop, close,
or system dismissal leaves the draft unsent. Included memory is unaffected.

The existing conversation settings handlers generate `contextCostActivationId`
inside `metadata.chatPreferences`. Unrelated saves preserve it. Disabling clears
it; re-enabling or changing paid tiers generates a new ID. No database migration
or pricing change is required. Legacy paid preferences receive one notice.

Acknowledgement is stored per authenticated user, conversation and activation in
the existing AsyncStorage approach. It survives refreshes on that installation;
another device/browser asks independently. Storage failure preserves the current
session's acknowledgement but may show the notice again after restarting.

Quotes remain per-send and server-authoritative. No client prices, credits or
entitlements are trusted. Quote failure opens a retry/cancel choice with an
explicit Included-for-this-message option; it never silently downgrades memory.
The existing pending-photo limitation is handled by an explicit Included choice,
without changing the saved setting. Account, conversation, draft and preference
changes cancel pending confirmation/quotes. Repeated Send cannot duplicate work.

## Release

- Deploy `together-conversation` and `together-group` with the new domain helper,
  preserving each function's authentication configuration and unrelated sources.
- Publish the web bundle. Native clients gain the UI on their next bundle/build;
  older clients remain compatible with the additive metadata field.
- No migration, ledger repair, provider-generation test or credit mutation needed.
- Rollback: restore the preceding web/function versions. Extra metadata is harmless.
- Focused mocked coverage includes activation changes, persistence/isolation,
  one-click send continuation, cancellation, quote failure/expiry, stale responses,
  photo handling, duplicate Send and popup actions. No paid AI calls are made.
