const UPSTREAM_ORIGIN = "https://ttutten-together--nxxu6ryphr.expo.app";
const CANONICAL_ORIGIN = "https://kivelli.app";
const SUPABASE_ORIGIN = "https://mfysnlghlhxxcwnwpxog.supabase.co";
const SUPABASE_PROXY_PREFIX = "/supabase";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
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

  const upstreamUrl = new URL(
    incomingUrl.pathname + incomingUrl.search,
    UPSTREAM_ORIGIN,
  );
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  upstreamRequest.headers.delete("host");
  upstreamRequest.headers.set("x-forwarded-host", incomingUrl.host);
  upstreamRequest.headers.set("x-forwarded-proto", "https");
  const acceptsHtml =
    (request.method === "GET" || request.method === "HEAD") &&
    (request.headers.get("accept") || "").includes("text/html");

  if (acceptsHtml) {
    upstreamRequest.headers.set("cache-control", "no-cache");
  }

  try {
    const upstreamResponse = await fetch(upstreamRequest, {
      redirect: "manual",
      ...(acceptsHtml
        ? { cf: { cacheTtlByStatus: { "200-599": -1 } } }
        : {}),
    });
    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get("location");

    if (acceptsHtml) {
      responseHeaders.set("cache-control", "no-cache, must-revalidate");
    }

    if (location) {
      try {
        const redirectUrl = new URL(location, UPSTREAM_ORIGIN);
        if (redirectUrl.origin === UPSTREAM_ORIGIN) {
          redirectUrl.protocol = "https:";
          redirectUrl.hostname = "kivelli.app";
          redirectUrl.port = "";
          responseHeaders.set("location", redirectUrl.toString());
        }
      } catch {
        // Preserve malformed or non-URL Location values from the upstream response.
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
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
