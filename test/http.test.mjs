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

test("non-2xx becomes a classifiable 'Shamela returned HTTP <status>' error", async () => {
  const http = createHttp({ fetchImpl: async () => ({ ok: false, status: 429, text: async () => "" }) });
  await assert.rejects(() => http.text("u"), /HTTP 429/);
});

test("aborts on timeout", async () => {
  const http = createHttp({
    timeoutMs: 10,
    fetchImpl: (_, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("The operation was aborted")))),
  });
  await assert.rejects(() => http.text("u"), /aborted/);
});
