/**
 * Polite Shamela fetch wrapper: bounded concurrency, timeout, in-flight
 * de-duplication, isolate memory cache, optional Cloudflare Cache API, and
 * bounded retries for transient 429/503 responses only.
 */

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ShamelaMCP/2.5; +https://github.com/themuhammad-personal/shamela-mcp)",
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
  return Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]).sort();
}

function requestKey(url, init = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const body = init.body == null ? null : typeof init.body === "string" ? init.body : String(init.body);
  return JSON.stringify([method, String(url), body, headerEntries(init.headers)]);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(response, now) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.max(0, Number(value) * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now()) : null;
}

export function createHttp({
  fetchImpl = fetch,
  ttl = 15 * 60_000,
  headers = DEFAULT_HEADERS,
  maxConcurrent = 4,
  timeoutMs = 20_000,
  maxCacheEntries = 500,
  maxRetries = 2,
  baseRetryMs = 500,
  maxRetryMs = 8_000,
  sleep = delay,
  random = Math.random,
  now = Date.now,
  cacheStorage = globalThis.caches?.default,
} = {}) {
  const ttlMs = Number.isFinite(Number(ttl)) ? Math.max(0, Number(ttl)) : 15 * 60_000;
  const concurrentLimit = Number.isFinite(Number(maxConcurrent)) && Number(maxConcurrent) > 0 ? Math.max(1, Math.floor(Number(maxConcurrent))) : 4;
  const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : 20_000;
  const cacheLimit = Number.isFinite(Number(maxCacheEntries)) ? Math.max(0, Math.floor(Number(maxCacheEntries))) : 500;
  const retries = Number.isFinite(Number(maxRetries)) ? Math.max(0, Math.floor(Number(maxRetries))) : 2;
  const retryBase = Math.max(0, Number(baseRetryMs) || 0);
  const retryCap = Math.max(retryBase, Number(maxRetryMs) || 0);
  const cache = new Map();
  const inflight = new Map();
  let active = 0;
  const queue = [];

  const acquire = () => new Promise((resolve) => {
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

  const sharedEligible = (url, init) => {
    const method = String(init.method ?? "GET").toUpperCase();
    if (!cacheStorage || ttlMs <= 0 || method !== "GET" || init.body != null) return false;
    try {
      const parsed = new URL(String(url));
      return !parsed.username && !parsed.password && !parsed.searchParams.has("key");
    } catch {
      return false;
    }
  };

  const sharedRequest = (url) => new Request(String(url), { method: "GET", headers: { Accept: "text/html,application/json" } });

  async function fetchAttempt(url, init) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl && timeout > 0 ? setTimeout(() => ctrl.abort(), timeout) : null;
    const extraHeaders = init.headers && typeof init.headers.entries === "function" ? Object.fromEntries(init.headers.entries()) : init.headers || {};
    try {
      return await fetchImpl(url, { ...init, headers: { ...headers, ...extraHeaders }, ...(ctrl ? { signal: ctrl.signal } : {}) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function doFetch(url, init) {
    let response;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      response = await fetchAttempt(url, init);
      if (response.ok) break;
      const transient = response.status === 429 || response.status === 503;
      if (!transient || attempt === retries) throw new Error(`Shamela returned HTTP ${response.status}`);
      const explicit = retryAfterMs(response, now);
      const exponential = Math.min(retryCap, retryBase * 2 ** attempt);
      const wait = Math.min(retryCap, explicit ?? exponential + exponential * 0.25 * random());
      await sleep(wait);
    }
    const body = await response.text();
    if (!String(body).trim()) throw unusableBody("empty HTTP 200 body");
    if (looksLikeChallenge(body)) throw unusableBody("HTTP 200 challenge page");
    return body;
  }

  async function text(url, init = {}) {
    const key = requestKey(url, init);
    const old = cache.get(key);
    if (old && ttlMs > 0 && now() - old.at < ttlMs) return old.text;
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      await acquire();
      try {
        const useShared = sharedEligible(url, init);
        if (useShared) {
          const hit = await cacheStorage.match(sharedRequest(url));
          if (hit) {
            const value = await hit.text();
            if (value && !looksLikeChallenge(value)) return value;
          }
        }
        const value = await doFetch(url, init);
        if (ttlMs > 0 && cacheLimit > 0) {
          if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
          cache.set(key, { text: value, at: now() });
        }
        if (useShared) {
          const seconds = Math.max(1, Math.floor(ttlMs / 1000));
          await cacheStorage.put(sharedRequest(url), new Response(value, { headers: { "Cache-Control": `public, max-age=${seconds}` } }));
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
