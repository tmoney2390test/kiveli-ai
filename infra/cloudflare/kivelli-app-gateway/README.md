# Kivelli app gateway

This Worker makes `https://kivelli.app` the canonical web origin while EAS Hosting remains the deployment origin. New EAS production deployments therefore appear on the custom domain without copying build artifacts to Cloudflare.

The `www` hostname redirects to the apex domain and preserves the path and query string.

Deploy from this directory with a narrowly scoped Cloudflare API token:

```sh
pnpm exec wrangler deploy --config wrangler.jsonc
```

Required permissions, scoped to the Kivelli account and `kivelli.app` zone:

- Account / Workers Scripts / Edit
- Zone / Workers Routes / Edit
- Zone / DNS / Edit
- Zone / Zone / Read

Never place the API token in this repository or in an `EXPO_PUBLIC_*` variable.
