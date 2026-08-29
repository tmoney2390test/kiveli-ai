const CANONICAL_ORIGIN = "https://kivelli.app";
const SUPABASE_ORIGIN = "https://mfysnlghlhxxcwnwpxog.supabase.co";
const SUPABASE_PROXY_PREFIX = "/supabase";
const FINGERPRINTED_ASSET = /(?:\.|-)[a-f0-9]{16,}\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|ttf|otf|webp|woff2?)$/i;

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.hostname === "www.kivelli.app") {
      const canonicalUrl = new URL(
        incomingUrl.pathname + incomingUrl.search,
        CANONICAL_ORIGIN,
      );
      return Response.redirect(canonicalUrl.toString(), 308);
    }

    if (
      incomingUrl.pathname === SUPABASE_PROXY_PREFIX ||
      incomingUrl.pathname.startsWith(`${SUPABASE_PROXY_PREFIX}/`)
    ) {
      return proxySupabaseRequest(request, incomingUrl);
    }

    return serveAppAsset(request, env);
  },
};

async function serveAppAsset(request, env) {
  try {
    const assetResponse = await env.ASSETS.fetch(request);
    const responseHeaders = new Headers(assetResponse.headers);
    const contentType = responseHeaders.get("content-type") || "";
    responseHeaders.set(
      "cache-control",
      browserCacheControl(new URL(request.url).pathname, contentType),
    );

    responseHeaders.set("x-kivelli-host", "cloudflare-assets");
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response("Kivelli is temporarily unavailable.", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}

function browserCacheControl(pathname, contentType) {
  if (contentType.includes("text/html")) return "no-cache, must-revalidate";
  if (FINGERPRINTED_ASSET.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname === "/favicon.ico") return "public, max-age=86400";
  return "public, max-age=3600, stale-while-revalidate=86400";
}

async function proxySupabaseRequest(request, incomingUrl) {
  const upstreamPath =
    incomingUrl.pathname.slice(SUPABASE_PROXY_PREFIX.length) || "/";
  const upstreamUrl = new URL(upstreamPath + incomingUrl.search, SUPABASE_ORIGIN);
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  upstreamRequest.headers.delete("host");
  upstreamRequest.headers.set("x-forwarded-host", incomingUrl.host);
  upstreamRequest.headers.set("x-forwarded-proto", "https");

  try {
    const upstreamResponse = await fetch(upstreamRequest, {
      redirect: "manual",
      cf: { cacheTtlByStatus: { "200-599": -1 } },
    });

    // Preserve the WebSocket object on realtime upgrades. Wrapping a 101
    // response in a new Response would detach it in the Workers runtime.
    if (upstreamResponse.status === 101) return upstreamResponse;

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-kivelle-api-proxy", "supabase");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "Kivelle could not reach the account service." }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}
