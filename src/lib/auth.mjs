/**
 * Optional shared-secret protection for the public `/mcp` endpoint (Roadmap 0.4).
 *
 * The Worker is a proxy in front of shamela.ws. Anyone who finds the URL can
 * make it hammer shamela on their behalf, so operators can require a key:
 *
 *   wrangler secret put MCP_API_KEY        # → env.MCP_API_KEY
 *
 * When the secret is unset the endpoint stays open (current behaviour). When
 * set, every non-preflight request to /mcp must present the key in one of:
 *
 *   Authorization: Bearer <key>            (preferred)
 *   X-API-Key: <key>
 *   ?key=<key>                             (for clients that cannot set headers —
 *                                           e.g. a connector UI that only takes a URL)
 *
 * Comparison is constant-time so the key cannot be guessed byte by byte from
 * response timing. Nothing here parses the MCP payload — auth happens before
 * the transport sees the request.
 */

const enc = new TextEncoder();

/** Constant-time string equality (length leak is acceptable; content is not). */
export function safeEqual(a, b) {
  const x = enc.encode(String(a ?? ""));
  const y = enc.encode(String(b ?? ""));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** The key a request presents, or null. Order: Bearer → X-API-Key → ?key=. */
export function presentedKey(request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^\s*Bearer\s+(.+?)\s*$/i.exec(auth)?.[1];
  if (bearer) return bearer;
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  try {
    const q = new URL(request.url).searchParams.get("key");
    if (q) return q;
  } catch {
    /* unparsable URL → no key */
  }
  return null;
}

/**
 * @returns {{ ok: true, mode: "open" | "key" } | { ok: false, reason: "missing_key" | "bad_key" }}
 */
export function authorize(request, env = {}) {
  const required = env?.MCP_API_KEY;
  if (!required) return { ok: true, mode: "open" };
  const got = presentedKey(request);
  if (!got) return { ok: false, reason: "missing_key" };
  return safeEqual(got, required) ? { ok: true, mode: "key" } : { ok: false, reason: "bad_key" };
}

/** 401 body — plain JSON, no MCP framing (the transport never ran). */
export function unauthorizedResponse(reason, extraHeaders = {}) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "unauthorized",
      reason,
      hint: "This endpoint requires an API key. Send `Authorization: Bearer <key>` (or `X-API-Key`, or `?key=` for header-less clients).",
    }),
    { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders } },
  );
}
