import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/tools.mjs";

// Offline mock of the shamela client (no network needed).
function mockClient() {
  return {
    categories: async () => [],
    booksByCategory: async () => ({ books: [] }),
    details: async (id) => ({
      book_id: id,
      title: "صحيح البخاري",
      author: "البخاري",
      metadata: { muhaqqiq: "محمد فؤاد عبد الباقي" },
      toc: [],
    }),
    bookPage: async (id, p) => ({ book_id: id, page_number: p, content: "حدثنا", book_title: "صحيح البخاري", author: "البخاري" }),
    titleSearch: async () => ({ results: [{ book_id: "123", title: "صحيح البخاري" }], total_available: 1 }),
    searchLibrary: async () => ({ results: [{ book_id: "123", page_id: "10" }] }),
    authorBooks: async () => ({ books: [] }),
    recent: async () => ({ books: [] }),
    allBooks: async () => ({ books: [] }),
  };
}

const s = createServer(mockClient());
const call = (name, args) => s._registeredTools[name].handler(args);

test("get_book_details attaches canonical fields from muhaqqiq", async () => {
  const out = await call("get_book_details", { book_id: "123" });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data.is_canonical_numbering, true);
  assert.equal(data.canonical_edition.key, "sahih-al-bukhari");
  assert.equal(data.canonical_edition.confidence, "author");
});

test("search_books_by_name: title-only → is_canonical_numbering false (no guessing)", async () => {
  const out = await call("search_books_by_name", { query: "البخاري", page: 1, limit: 10 });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data.results[0].is_canonical_numbering, false);
  assert.equal(data.results[0].canonical_edition.confidence, "title");
});

test("get_book_page attaches (empty) hadith_numbers reverse lookup", async () => {
  const out = await call("get_book_page", { book_id: "123", page_number: "10" });
  const data = JSON.parse(out.content[0].text);
  assert.deepEqual(data.hadith_numbers, []);
});

test("get_hadith_by_number degrades gracefully when index is unbuilt", async () => {
  const out = await call("get_hadith_by_number", { book_id: "123", hadith_number: "8" });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data.found, false);
  assert.ok(data.reason, "has a reason");
  assert.equal(data.hadith_number, "8");
});

test("get_tafsir_by_ayah degrades gracefully when index is unbuilt", async () => {
  const out = await call("get_tafsir_by_ayah", { book_id: "123", surah: 2, ayah: 255 });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data.found, false);
  assert.ok(data.reason, "has a reason");
});

test("search_library attaches hadith_numbers deep-link field", async () => {
  const out = await call("search_library", { query: "إيمان", match_mode: "any_words", page: 1 });
  const data = JSON.parse(out.content[0].text);
  assert.ok(Array.isArray(data.results));
  // empty index → field omitted (undefined), never fabricated
  assert.equal(data.results[0].hadith_numbers, undefined);
});

// --- structured failures --------------------------------------------------

function failingClient(error) {
  const boom = async () => {
    throw error;
  };
  return {
    categories: boom, booksByCategory: boom, details: boom, bookPage: boom,
    titleSearch: boom, searchLibrary: boom, authorBooks: boom, recent: boom, allBooks: boom,
  };
}

const failCall = async (error, name, args) => {
  const srv = createServer(failingClient(error));
  const out = await srv._registeredTools[name].handler(args);
  return { out, data: JSON.parse(out.content[0].text) };
};

test("upstream failure returns a structured error, not a bare runtime message", async () => {
  // Regression: an unreachable shamela.ws used to surface only
  // "Network connection lost." — no tool name, no hint, nothing actionable.
  const { out, data } = await failCall(new Error("Network connection lost."), "get_categories", {});
  assert.equal(out.isError, true);
  assert.equal(data.ok, false);
  assert.equal(data.tool, "get_categories");
  assert.equal(data.error, "network");
  assert.ok(data.hint && data.hint.length > 10, "carries an actionable hint");
  assert.equal(data.fabricated, false);
});

test("shamela HTTP 429 is classified as rate-limiting", async () => {
  const { data } = await failCall(new Error("Shamela returned HTTP 429"), "get_book_details", { book_id: "1" });
  assert.equal(data.error, "upstream_http");
  assert.equal(data.status, 429);
  assert.match(data.hint, /rate-limit/);
});

test("errors never leak a stack trace", async () => {
  const err = new Error("kaboom");
  const { out, data } = await failCall(err, "get_categories", {});
  const raw = out.content[0].text;
  assert.equal(raw.includes("at Object."), false, "no stack frames");
  assert.equal(data.stack, undefined);
  assert.equal(raw.includes("kaboom"), true, "the message itself is kept for diagnosis");
});

test("stack frames are stripped even when they arrive inside the message", async () => {
  const { out } = await failCall(
    new Error("boom\n    at Object.<anonymous> (/src/tools.mjs:1:1)"),
    "get_categories",
    {},
  );
  assert.equal(out.content[0].text.includes("at Object."), false);
});

test("get_hadith_by_number surfaces a compact index_status, not the whole index", async () => {
  const out = await call("get_hadith_by_number", { book_id: "123", hadith_number: "8" });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data.index_status.books, undefined);
  assert.ok(Array.isArray(data.index_status.indexed_book_ids));
  assert.equal(typeof data.canonical_map.verified_book_ids, "number");
});
