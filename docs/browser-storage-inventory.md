# Browser storage inventory

This inventory covers application-owned storage. Recheck browser developer tools on each production release for cookies set by hosting, identity, payment, or other providers.

| Storage | Purpose | Choice |
| --- | --- | --- |
| Supabase auth storage | Keep the signed-in session and refresh it | Required for signed-in features |
| `__Host-kivelli_web_session` cookie | Verify restricted web-session access | Required for restricted web features |
| Cloudflare `__cf_bm` cookie | Bot protection on some requests; Cloudflare may set it for about 30 minutes of inactivity | Security |
| Session storage for route, group, snapshot, and image caches | Restore requested screens and avoid repeated loading within the tab | Functional; cleared with the tab/session |
| Local drafts and user preferences | Restore text and selected settings | Functional |
| `kivelli_release` cookie | Previously duplicated a response header; removed | No longer set |
| Product analytics and client performance events | Measure feature use and timing | Off until a versioned, affirmative choice in Privacy settings |

Cloudflare's automatic Web Analytics/RUM injection for `kivelli.app` was disabled on 2026-10-01. The production browser check then found no Cloudflare beacon script. Cloudflare's network and security diagnostics remain separate from product analytics.

Analytics consent is held in the authenticated profile, not a cookie. The app drops queued client performance events when consent is absent or withdrawn, the Edge endpoint checks the profile, and database triggers reject user-scoped analytics and performance inserts without valid consent. Security logs and transaction records remain separate from product analytics.

Do not add marketing pixels, browser identifiers, or new storage for optional purposes without revisiting this inventory, the privacy disclosure, and the consent gate.
