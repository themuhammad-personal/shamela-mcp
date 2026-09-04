/**
 * Minimal fetch wrapper with an in-memory TTL cache, a per-isolate concurrency
 * cap and a short timeout — shamela.ws is a third-party site we must not
 * hammer (Roadmap 0.4), and Workers must not hang on a slow upstream.
 *
 * `fetchImpl` is injectable so tests can run offline against fixtures.
 */

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ShamelaMCP/2.3; +https://github.com/themuhammad-personal/shamela-mcp)",
  "Accept-Language": "ar,en;q=0.8",
};

function unusableBody(reason) {
  const error = new Error(`Shamela returned an unusable response: ${reason}`);
  error.code = "SHAMELA_INVALID_BODY";
  return error;
}

function looksLikeChallenge(body) {
  const sample = String(body ?? "").slice(0, 20_000);
  return /just a moment|checking your browser|enable javascript and cookies|challenge-platform|cf-chl-|attention required/i.test(sample);
}

function headerEntries(headers) {
  if (!headers) return [];
  if (typeof headers.entries === "function") return [...headers.entries()].map(([key, value]) => [key.toLowerCase(), String(value)]).sort();
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value)])
    .sort();
}

function requestKey(url, init = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const body = init.body == null ? null : typeof init.body === "string" ? init.body : String(init.body);
  return JSON.stringify([method, String(url), body, headerEntries(init.headers)]);
}

export function createHttp({
  fetchImpl = fetch,
  ttl = 15 * 60_000,
  headers = DEFAULT_HEADERS,
  maxConcurrent = 4,
  timeoutMs = 20_000,
  maxCacheEntries = 500,
} = {}) {
  const ttlMs = Number.isFinite(Number(ttl)) ? Math.max(0, Number(ttl)) : 15 * 60_000;
  const concurrentLimit = Number.isFinite(Number(maxConcurrent)) && Number(maxConcurrent) > 0 ? Math.max(1, Math.floor(Number(maxConcurrent))) : 4;
  const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : 20_000;
  const cacheLimit = Number.isFinite(Number(maxCacheEntries)) ? Math.max(0, Math.floor(Number(maxCacheEntries))) : 500;
  const cache = new Map();
  const inflight = new Map();
  let active = 0;
  const queue = [];

  const acquire = () =>
    new Promise((resolve) => {
      if (active < concurrentLimit) {
        active += 1;
        resolve();
      } else queue.push(resolve);
    });
  const release = () => {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  };

  async function doFetch(url, init) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    const extraHeaders = init.headers && typeof init.headers.entries === "function" ? Object.fromEntries(init.headers.entries()) : init.headers || {};
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { ...headers, ...extraHeaders },
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      if (!res.ok) throw new Error(`Shamela returned HTTP ${res.status}`);
      const body = await res.text();
      if (!String(body).trim()) throw unusableBody("empty HTTP 200 body");
      if (looksLikeChallenge(body)) throw unusableBody("HTTP 200 challenge page");
      return body;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function text(url, init = {}) {
    const key = requestKey(url, init);
    const old = cache.get(key);
    if (old && ttlMs > 0 && Date.now() - old.at < ttlMs) return old.text;
    if (inflight.has(key)) return inflight.get(key); // de-dupe concurrent identical requests

    const p = (async () => {
      await acquire();
      try {
        const value = await doFetch(url, init);
        if (ttlMs > 0 && cacheLimit > 0) {
          if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
          cache.set(key, { text: value, at: Date.now() });
        }
        return value;
      } finally {
        release();
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  return { text };
}
