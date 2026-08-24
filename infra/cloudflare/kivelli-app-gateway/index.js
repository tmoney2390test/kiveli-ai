const UPSTREAM_ORIGIN = "https://ttutten-together.expo.app";
const CANONICAL_ORIGIN = "https://kivelli.app";

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

  const upstreamUrl = new URL(
    incomingUrl.pathname + incomingUrl.search,
    UPSTREAM_ORIGIN,
  );
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  upstreamRequest.headers.delete("host");
  upstreamRequest.headers.set("x-forwarded-host", incomingUrl.host);
  upstreamRequest.headers.set("x-forwarded-proto", "https");

  try {
    const upstreamResponse = await fetch(upstreamRequest, { redirect: "manual" });
    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get("location");

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
