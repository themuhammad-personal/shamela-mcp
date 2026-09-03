/**
 * Minimal fetch wrapper with an in-memory TTL cache.
 *
 * `fetchImpl` is injectable so tests can run offline against fixtures.
 */

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ShamelaMCP/2.0)",
  "Accept-Language": "ar,en;q=0.8",
};

export function createHttp({
  fetchImpl = fetch,
  ttl = 15 * 60_000,
  headers = DEFAULT_HEADERS,
} = {}) {
  const cache = new Map();

  async function text(url, init = {}) {
    const key = init.method === "POST" ? `${url}|${String(init.body)}` : url;
    const old = cache.get(key);
    if (old && Date.now() - old.at < ttl) return old.text;

    const res = await fetchImpl(url, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`Shamela returned HTTP ${res.status}`);
    const value = await res.text();
    cache.set(key, { text: value, at: Date.now() });
    return value;
  }

  return { text };
}
