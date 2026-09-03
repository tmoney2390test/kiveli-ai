const CANONICAL_ORIGIN = "https://kivelli.app";
const SUPABASE_ORIGIN = "https://mfysnlghlhxxcwnwpxog.supabase.co";
const SUPABASE_PROXY_PREFIX = "/supabase";
const APP_RELEASE_FALLBACK = "kivelli-web";
const FINGERPRINTED_ASSET = /(?:\.|-)[a-f0-9]{16,}\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|ttf|otf|webp|woff2?)$/i;
const EXPO_ENTRY_ASSET = /\bentry-([a-f0-9]{16,})\.js\b/i;

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
      return proxySupabaseRequest(request, incomingUrl, env);
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      isRetiredStoryPath(incomingUrl.pathname)
    ) {
      const homeUrl = new URL("/home", CANONICAL_ORIGIN);
      return Response.redirect(homeUrl.toString(), 308);
    }

    return serveAppAsset(request, env);
  },
};

function isRetiredStoryPath(pathname) {
  return pathname === "/stories" ||
    pathname.startsWith("/stories/") ||
    pathname === "/story-library" ||
    pathname.startsWith("/story-library/") ||
    pathname === "/story-case" ||
    pathname.startsWith("/story-case/") ||
    pathname === "/story-play" ||
    pathname.startsWith("/story-play/");
}

async function serveAppAsset(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    const assetResponse = await env.ASSETS.fetch(request);
    const responseHeaders = new Headers(assetResponse.headers);
    const contentType = responseHeaders.get("content-type") || "";
    if (isApplicationAssetPath(pathname) && contentType.includes("text/html")) {
      return missingApplicationAssetResponse(pathname);
    }
    responseHeaders.set(
      "cache-control",
      browserCacheControl(pathname, contentType),
    );
    if (contentType.includes("text/html")) {
      const html = request.method === "HEAD" ? null : await assetResponse.text();
      const release = releaseFromHtml(html) ?? APP_RELEASE_FALLBACK;
      responseHeaders.set("x-kivelli-release", release);
      const preloads = scriptPreloadHeader(html);
      if (preloads) responseHeaders.set("link", preloads);
      if (html !== null && !hasCookieValue(request.headers.get("cookie"), "kivelli_release", release)) {
        responseHeaders.append(
          "set-cookie",
          `kivelli_release=${release}; Path=/; Max-Age=604800; Secure; SameSite=Lax`,
        );
      }
      responseHeaders.set("x-kivelli-host", "cloudflare-assets");
      return new Response(html, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: responseHeaders,
      });
    }
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

export function releaseFromHtml(html) {
  if (!html) return null;
  return html.match(EXPO_ENTRY_ASSET)?.[1] ?? null;
}

export function isApplicationAssetPath(pathname) {
  return pathname.startsWith("/_expo/static/") || FINGERPRINTED_ASSET.test(pathname);
}

function missingApplicationAssetResponse(pathname) {
  if (/\.(?:js|mjs)$/i.test(pathname)) {
    return new Response(
      "(()=>{if(window.__kivelliStaleAssetReloading)return;window.__kivelliStaleAssetReloading=true;try{const k='kivelle:gateway-stale-asset-recovery',n=Date.now(),p=Number(sessionStorage.getItem(k)||0);if(n-p<60000){window.__kivelliStaleAssetReloading=false;return}sessionStorage.setItem(k,String(n))}catch{}window.location.reload()})();",
      {
        status: 200,
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-kivelli-asset-status": "stale-release-recovery",
          "x-kivelli-host": "cloudflare-assets",
        },
      },
    );
  }
  return new Response("This Kivelle asset belongs to an older release. Refresh to continue.", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-kivelli-asset-status": "stale-release",
      "x-kivelli-host": "cloudflare-assets",
    },
  });
}

export function browserCacheControl(pathname, contentType) {
  if (contentType.includes("text/html")) return "no-store";
  if (FINGERPRINTED_ASSET.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname === "/favicon.ico") return "public, max-age=86400";
  return "public, max-age=3600, stale-while-revalidate=86400";
}

function hasCookieValue(cookieHeader, name, value) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((cookie) => cookie.trim() === `${name}=${value}`);
}

async function proxySupabaseRequest(request, incomingUrl, env) {
  const upstreamPath =
    incomingUrl.pathname.slice(SUPABASE_PROXY_PREFIX.length) || "/";
  const upstreamUrl = new URL(upstreamPath + incomingUrl.search, SUPABASE_ORIGIN);
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  upstreamRequest.headers.delete("host");
  for (const name of [
    "x-kivelli-surface",
    "x-kivelli-surface-user",
    "x-kivelli-surface-time",
    "x-kivelli-surface-nonce",
    "x-kivelli-surface-path",
    "x-kivelli-surface-signature",
  ]) upstreamRequest.headers.delete(name);
  upstreamRequest.headers.set("x-forwarded-host", incomingUrl.host);
  upstreamRequest.headers.set("x-forwarded-proto", "https");
  const subject = jwtSubject(upstreamRequest.headers.get("authorization"));
  if (env.KIVELLE_SURFACE_SIGNING_SECRET && subject) {
    const assertion = await createWebSurfaceAssertion({
      secret: env.KIVELLE_SURFACE_SIGNING_SECRET,
      method: request.method,
      path: upstreamUrl.pathname,
      userId: subject,
    });
    for (const [name, value] of Object.entries(assertion)) upstreamRequest.headers.set(name, value);
  }

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
    responseHeaders.set("x-kivelli-api-proxy", "supabase");
    if ((responseHeaders.get("content-type") || "").startsWith("video/")) {
      responseHeaders.set("accept-ranges", "bytes");
      responseHeaders.set("content-disposition", "inline");
      responseHeaders.set("x-content-type-options", "nosniff");
    }
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

export function scriptPreloadHeader(html) {
  if (!html) return null;
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((source) => source.startsWith("/_expo/static/js/web/"))
    .slice(0, 8);
  return sources.length
    ? sources.map((source) => `<${source}>; rel=preload; as=script`).join(", ")
    : null;
}

export async function createWebSurfaceAssertion({ secret, method, path, userId, now = Date.now(), nonce = crypto.randomUUID() }) {
  const timestamp = String(Math.floor(now / 1000));
  const canonical = surfaceCanonical(method, path, userId, timestamp, nonce);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical))));
  return {
    "x-kivelli-surface": "web",
    "x-kivelli-surface-user": userId,
    "x-kivelli-surface-time": timestamp,
    "x-kivelli-surface-nonce": nonce,
    "x-kivelli-surface-path": path,
    "x-kivelli-surface-signature": signature,
  };
}

export function surfaceCanonical(method, path, userId, timestamp, nonce) {
  return [String(method).toUpperCase(), path, userId, timestamp, nonce, "web"].join("\n");
}

export function jwtSubject(authorization) {
  try {
    if (!authorization?.startsWith("Bearer ")) return null;
    const payload = authorization.slice(7).split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const subject = JSON.parse(atob(normalized)).sub;
    return typeof subject === "string" && /^[0-9a-f-]{36}$/i.test(subject) ? subject : null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
