import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttp } from "../src/lib/http.mjs";

const ok = (body) => ({ ok: true, status: 200, text: async () => body });

test("caches GET responses within ttl and de-dupes concurrent identical requests", async () => {
  let calls = 0;
  const http = createHttp({ fetchImpl: async () => ((calls += 1), ok("x")) });
  const [a, b] = await Promise.all([http.text("u"), http.text("u")]);
  await http.text("u");
  assert.equal(a, "x");
  assert.equal(b, "x");
  assert.equal(calls, 1);
});

test("ttl=0 disables caching (used by the index builder for fresh data)", async () => {
  let calls = 0;
  const http = createHttp({ fetchImpl: async () => ((calls += 1), ok("x")), ttl: 0 });
  await http.text("u");
  await http.text("u");
  assert.equal(calls, 2);
});

test("cache identity includes method and body, so GET and POST cannot collide", async () => {
  const seen = [];
  const http = createHttp({
    fetchImpl: async (url, init) => {
      seen.push([url, init.method ?? "GET", init.body ?? null]);
      return ok(`${init.method ?? "GET"}:${init.body ?? "none"}`);
    },
  });
  assert.equal(await http.text("u", { method: "POST", body: "a" }), "POST:a");
  assert.equal(await http.text("u", { method: "POST", body: "b" }), "POST:b");
  assert.equal(await http.text("u"), "GET:none");
  assert.equal(seen.length, 3);
});

test("maxCacheEntries=0 really disables storage instead of retaining one entry", async () => {
  let calls = 0;
  const http = createHttp({ maxCacheEntries: 0, fetchImpl: async () => ((calls += 1), ok("x")) });
  await http.text("u");
  await http.text("u");
  assert.equal(calls, 2);
});

test("HTTP 200 empty or Cloudflare challenge bodies are rejected as unusable upstream responses", async () => {
  const empty = createHttp({ fetchImpl: async () => ok("   ") });
  await assert.rejects(() => empty.text("u"), /empty HTTP 200/);
  const challenge = createHttp({ fetchImpl: async () => ok("<html><title>Just a moment...</title><div id=\"cf-chl-widget\"></div></html>") });
  await assert.rejects(() => challenge.text("u"), /challenge/);
});

test("never runs more than maxConcurrent upstream requests at once", async () => {
  let active = 0;
  let peak = 0;
  const http = createHttp({
    maxConcurrent: 2,
    fetchImpl: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return ok("x");
    },
  });
  await Promise.all(["a", "b", "c", "d", "e"].map((u) => http.text(u)));
  assert.equal(peak, 2);
});

test("invalid concurrency settings cannot deadlock the request queue", async () => {
  let calls = 0;
  const http = createHttp({ maxConcurrent: 0, fetchImpl: async () => ((calls += 1), ok("x")) });
  assert.equal(await http.text("u"), "x");
  assert.equal(calls, 1);
});

test("cache identity includes request headers that can change the response", async () => {
  let calls = 0;
  const http = createHttp({ fetchImpl: async (_, init) => ((calls += 1), ok(init.headers.Accept ?? "none")) });
  assert.equal(await http.text("u", { headers: { Accept: "application/json" } }), "application/json");
  assert.equal(await http.text("u", { headers: { Accept: "text/plain" } }), "text/plain");
  assert.equal(calls, 2);
});

test("non-2xx becomes a classifiable 'Shamela returned HTTP <status>' error", async () => {
  const http = createHttp({ fetchImpl: async () => ({ ok: false, status: 429, text: async () => "" }) });
  await assert.rejects(() => http.text("u"), /HTTP 429/);
});

test("retries only 429/503 with bounded Retry-After-aware delays", async () => {
  const waits = [];
  let calls = 0;
  const http = createHttp({
    maxRetries: 2,
    sleep: async (ms) => waits.push(ms),
    random: () => 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 503, headers: { "Retry-After": "2" } });
      return new Response("ok");
    },
  });
  assert.equal(await http.text("https://shamela.ws/book/1/1"), "ok");
  assert.deepEqual(waits, [2000]);
  assert.equal(calls, 2);

  let forbiddenCalls = 0;
  const forbidden = createHttp({ maxRetries: 5, fetchImpl: async () => ((forbiddenCalls += 1), new Response("no", { status: 403 })) });
  await assert.rejects(() => forbidden.text("https://shamela.ws/book/1/1"), /HTTP 403/);
  assert.equal(forbiddenCalls, 1);
});

test("Cloudflare Cache API stores successful GETs and ttl=0 bypasses it", async () => {
  const entries = new Map();
  const fakeCache = {
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, response.clone()); },
  };
  let calls = 0;
  const first = createHttp({ cacheStorage: fakeCache, fetchImpl: async () => ((calls += 1), new Response("shared")) });
  assert.equal(await first.text("https://shamela.ws/book/1/1"), "shared");
  const second = createHttp({ cacheStorage: fakeCache, fetchImpl: async () => ((calls += 1), new Response("network")) });
  assert.equal(await second.text("https://shamela.ws/book/1/1"), "shared");
  assert.equal(calls, 1);
  const bypass = createHttp({ ttl: 0, cacheStorage: fakeCache, fetchImpl: async () => ((calls += 1), new Response("fresh")) });
  assert.equal(await bypass.text("https://shamela.ws/book/1/1"), "fresh");
});

test("aborts on timeout", async () => {
  const http = createHttp({
    timeoutMs: 10,
    fetchImpl: (_, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("The operation was aborted")))),
  });
  await assert.rejects(() => http.text("u"), /aborted/);
});
