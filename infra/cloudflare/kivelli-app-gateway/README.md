# Kivelli app gateway

This Worker hosts the Kivelli web export directly on Cloudflare Static Assets at
`https://kivelli.app`. It does not depend on Expo/EAS Hosting.

Build production web exports through EAS environment injection and clear Metro's
cache so an earlier placeholder configuration cannot be reused:

```sh
eas env:exec production "pnpm web:build:production" --non-interactive
```

The production build script fails before deployment if the compiled entry
bundle contains a placeholder or does not contain the configured API endpoint.

The `www` hostname redirects to the apex domain and preserves the path and query string.

Client Supabase traffic is served through `https://kivelli.app/supabase`. The
same-origin proxy prevents privacy tools and network filters from blocking the
account/API service solely because it uses a third-party hostname. It forwards
auth, REST, Storage, Functions, and realtime upgrades without caching their
responses; permanent Supabase credentials remain server-side only.

Website requests also receive a short-lived HMAC surface assertion. Configure
the same random 32+ byte value as `KIVELLE_SURFACE_SIGNING_SECRET` in this
Worker and in Supabase Edge Function secrets. iOS and Android builds use the
direct Supabase project URL and must never be configured to use this gateway.

```sh
pnpm exec wrangler secret put KIVELLE_SURFACE_SIGNING_SECRET
```

After building, deploy from this directory with a narrowly scoped Cloudflare API token:

```sh
pnpm dlx wrangler@latest deploy --config wrangler.jsonc
```

Required permissions, scoped to the Kivelli account and `kivelli.app` zone:

- Account / Workers Scripts / Edit
- Zone / Workers Routes / Edit
- Zone / DNS / Edit
- Zone / Zone / Read

Never place the API token in this repository or in an `EXPO_PUBLIC_*` variable.
