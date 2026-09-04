import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize, presentedKey, safeEqual, stripApiKeyFromUrl } from "../src/lib/auth.mjs";
import worker from "../src/index.mjs";

const req = (url, init = {}) => new Request(url, init);
const MCP = "https://example.workers.dev/mcp";
const INIT_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
const post = (headers = {}, url = MCP) =>
  req(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: INIT_BODY });

test("safeEqual: equal strings true, different lengths/contents false", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual(undefined, ""), true);
});

test("presentedKey: Bearer beats X-API-Key beats ?key=", () => {
  assert.equal(presentedKey(req(`${MCP}?key=q`, { headers: { Authorization: "Bearer b", "X-API-Key": "x" } })), "b");
  assert.equal(presentedKey(req(`${MCP}?key=q`, { headers: { "X-API-Key": "x" } })), "x");
  assert.equal(presentedKey(req(`${MCP}?key=q`)), "q");
  assert.equal(presentedKey(req(MCP)), null);
  assert.equal(presentedKey(req(MCP, { headers: { Authorization: "Basic abc" } })), null, "only Bearer is accepted from Authorization");
});

test("authorize: no secret configured → open", () => {
  assert.deepEqual(authorize(req(MCP), {}), { ok: true, mode: "open" });
  assert.deepEqual(authorize(req(MCP), { MCP_API_KEY: "" }), { ok: true, mode: "open" });
});

test("authorize: secret configured → key required and must match", () => {
  const env = { MCP_API_KEY: "s3cret" };
  assert.deepEqual(authorize(req(MCP), env), { ok: false, reason: "missing_key" });
  assert.deepEqual(authorize(req(MCP, { headers: { Authorization: "Bearer nope" } }), env), { ok: false, reason: "bad_key" });
  assert.deepEqual(authorize(req(MCP, { headers: { Authorization: "Bearer s3cret" } }), env), { ok: true, mode: "key" });
  assert.deepEqual(authorize(req(`${MCP}?key=s3cret`), env), { ok: true, mode: "key" });
});

test("worker: CORS preflight is always open and advertises Authorization", async () => {
  const res = await worker.fetch(req(MCP, { method: "OPTIONS" }), { MCP_API_KEY: "s3cret" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /X-API-Key/);
});

test("worker: locked endpoint → 401 JSON without a key, MCP proceeds with the key", async () => {
  const env = { MCP_API_KEY: "s3cret" };
  const denied = await worker.fetch(post(), env);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await denied.json();
  assert.equal(body.error, "unauthorized");
  assert.equal(body.reason, "missing_key");

  const wrong = await worker.fetch(post({ Authorization: "Bearer wrong" }), env);
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).reason, "bad_key");

  const ok = await worker.fetch(post({ Authorization: "Bearer s3cret" }), env);
  assert.equal(ok.status, 200, "initialize answered once the key is right");
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "*", "real responses carry the CORS headers the preflight promised");
  const init = await ok.json();
  assert.equal(init.result.serverInfo.name, "shamela-library");
});

test("worker: no secret → endpoint open (unchanged behaviour) and root page says so", async () => {
  const ok = await worker.fetch(post(), {});
  assert.equal(ok.status, 200);
  const root = await worker.fetch(req("https://example.workers.dev/"), {});
  assert.equal(root.status, 200);
  assert.doesNotMatch(await root.text(), /API key required/);
  const lockedRoot = await worker.fetch(req("https://example.workers.dev/"), { MCP_API_KEY: "x" });
  assert.match(await lockedRoot.text(), /API key required/);
});
