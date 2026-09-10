# Standard and Cinematic videos

Customers choose Standard (Seedance 1.5 Pro) or Cinematic (MiniMax H3). Each family has separate SFW and adult provider routes. Route names and provider costs are available only in Operations. The backend selects the content variant from the prompt and source photo, and rejects adult submissions on native/unknown surfaces.

Only these four routes accept new jobs. Historical route definitions remain available to the dispatcher and finalizer, including delivery retries. Cinematic includes audio; Standard exposes Sound only when turning it off reduces the displayed credit price. Existing silent requests retain their original audio-removal behavior.

The public catalog comes from `packages/together-domain/src/video-consumer.ts`. A bundled catalog renders immediately, and a persisted public catalog supplies the last valid prices. Account eligibility, balance, source-image authorization, and locations are fetched separately. Customer credit publications are append-only and independent of provider price observations. New clients submit their displayed credit total for server comparison before reservation. Older clients without this field are accepted only while the original credit rate and minimum remain unchanged; after a price change they must update/reopen with a supported client.

## Operations

Open `/ops` and select **Video costs**. Viewer roles can review prices; admins can start a price check and review/publish new credit rates. Publication history records the actor, timestamp, rates, and reason. Provider quotes never automatically change customer credits.

The daily monitor runs at 06:15 UTC through Supabase Cron. It calls `together-video-prices` using the existing media dispatcher secret held in Vault. A database lease prevents overlapping checks. Two concurrent workers quote the 76 supported route/settings combinations without generating videos or sending private media. Failed calls receive bounded retries and an error observation. The request-time quote cache remains in use; fresh quotes also create observations.

WaveSpeed `price` is the list price; `discounted_price` is payable, including a valid zero. Both are retained with the discount percentage and source/time. The first live scan on September 10, 2026 returned 76 valid quotes and no failures. At 5 seconds, Seedance 720p quoted $0.13 silent / $0.26 with audio. MiniMax 768p quoted $0.40 list / $0.20 payable (50% discount) for both variants. These are generation quotes; they exclude opening-frame generation, review, storage, and store fees. Billing reconciliation is not available in this release, so quotes are not labeled as actual invoiced costs or profit.

Price history, check status, increases, stale observations, and 30-day generation outcomes are shown in Ops. Private tables permit service-role access only. Customer sessions cannot query price history, run checks, or publish rates.

## Verification

Run the Deno video route, price, admission, content-policy, quality, and finalization tests; the app suite; typechecking and lint; and `node scripts/test-video-prices-db.mjs`. The latter verifies migration execution, service-role grants, single-monitor admission, zero-dollar records, and append-only history.

Deploy the migration before `together-media`, `together-ops`, and `together-video-prices`; preserve current dispatch/webhook code and the visual-advisory delivery policy. Deploy the web bundle from current main, retaining concurrent changes. Native UI changes take effect with the next native app release; server-side native adult restrictions remain active throughout.
