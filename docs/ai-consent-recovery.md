# AI consent check recovery

The client distinguishes an actual declined/dismissed choice from a failed lookup.
`CONSENT_REQUIRED` remains the outcome of a real negative choice. A temporary
network/server failure, unavailable consent bridge, or interrupted verification
uses retryable `CONSENT_CHECK_UNAVAILABLE`; authentication errors retain their code.

Consent checks get at most two attempts total. A foreground/background cache
invalidation during verification requires a fresh check before proceeding. Repeated
invalidations fail closed with a retryable error, not a fabricated decline. No AI
operation is started or replayed by this retry. A changed account/bridge invalidates
old results; stale cleanup cannot remove the new bridge or reuse its predecessor's
cache. A manual review is not reopened solely because a lifecycle recheck is needed.

The bridge shares its pending lookup/disclosure among concurrent callers and
propagates lookup errors rather than resolving them as `false`. Saving a choice
uses the returned server consent state, not just the button the client pressed.

No consent records, disclosure versions, profile preferences, backend gates,
provider routes, or data-sharing policies change. A valid current acceptance is
still required server-side immediately before applicable provider calls. No
database migration or backend deployment is required. The website needs a new web
export; installed native builds need an updated client release.

Focused regressions: cached consent; real refusal/withdrawal; unavailable bridge;
one transient failure; sustained network/server failure; bounded lifecycle
revalidation; authentication errors; account switching; stale cleanup; manual
review interrupted by lifecycle changes.
