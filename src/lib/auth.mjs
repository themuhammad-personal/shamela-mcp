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

/** Compare UTF-8 bytes without returning early on a length mismatch. */
export function safeEqual(a, b) {
  const x = enc.encode(String(a ?? ""));
  const y = enc.encode(String(b ?? ""));
  const length = Math.max(x.length, y.length);
  let diff = x.length === y.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Remove the credential query parameter before a request reaches the MCP transport. */
export function stripApiKeyFromUrl(value) {
  try {
    const url = new URL(String(value));
    url.searchParams.delete("key");
    return url.toString();
  } catch {
    return String(value);
  }
}

/** The credential a request presents. Order: Bearer → X-API-Key → deprecated ?key=. */
export function presentedCredential(request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^\s*Bearer\s+(.+?)\s*$/i.exec(auth)?.[1];
  if (bearer) return { key: bearer, source: "bearer" };
  const header = request.headers.get("x-api-key");
  if (header) return { key: header.trim(), source: "x-api-key" };
  try {
    const q = new URL(request.url).searchParams.get("key");
    if (q) return { key: q, source: "query" };
  } catch {
    /* unparsable URL → no key */
  }
  return null;
}

export function presentedKey(request) {
  return presentedCredential(request)?.key ?? null;
}

/**
 * @returns {{ ok: true, mode: "open" | "key" } | { ok: false, reason: "missing_key" | "bad_key" }}
 */
export function authorize(request, env = {}) {
  const required = env?.MCP_API_KEY;
  if (!required) return { ok: true, mode: "open" };
  const credential = presentedCredential(request);
  if (!credential) return { ok: false, reason: "missing_key" };
  if (!safeEqual(credential.key, required)) return { ok: false, reason: "bad_key" };
  return credential.source === "query"
    ? { ok: true, mode: "key", credential_source: "query", deprecated: true }
    : { ok: true, mode: "key" };
}

/** 401 body — plain JSON, no MCP framing (the transport never ran). */
export function unauthorizedResponse(reason, extraHeaders = {}) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "unauthorized",
      reason,
      hint: "This endpoint requires an API key. Send `Authorization: Bearer <key>` (preferred) or `X-API-Key`. Deprecated `?key=` remains temporarily available only for header-less clients.",
    }),
    { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders } },
  );
}
