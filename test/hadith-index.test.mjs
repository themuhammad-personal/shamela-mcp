import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHadith, resolveTafsirAyah, hadithNumbersOnPage, indexStatus } from "../src/lib/hadith-index.mjs";

const fixture = {
  generated_at: "2026-01-01T00:00:00Z",
  books: {
    "111": {
      type: "hadith",
      index: { "1": { page: "10" }, "8": { page: "25", note: "باب بدء الوحي" } },
      reverse: { "10": ["1"], "25": ["8"] },
    },
    "222": { type: "tafsir", ayahs: { "2:255": { page: "40", note: "آية الكرسي" } } },
  },
};

test("indexStatus reports seed state", () => {
  const empty = indexStatus({ generated_at: null, books: {} });
  assert.equal(empty.books_indexed, 0);
  assert.equal(indexStatus(fixture).books_indexed, 2);
});

test("resolveHadith returns page for known number", () => {
  const r = resolveHadith("111", "8", fixture);
  assert.equal(r.found, true);
  assert.equal(r.page, "25");
});

test("resolveHadith: unknown number → found:false, never fabricated", () => {
  const r = resolveHadith("111", "999", fixture);
  assert.equal(r.found, false);
  assert.equal(r.reason, "hadith_number_not_indexed");
});

test("resolveHadith: unindexed book → found:false", () => {
  const r = resolveHadith("999", "1", fixture);
  assert.equal(r.found, false);
  assert.equal(r.reason, "no_hadith_index_for_book");
});

test("hadithNumbersOnPage reverse lookup", () => {
  assert.deepEqual(hadithNumbersOnPage("111", "25", fixture), ["8"]);
  assert.deepEqual(hadithNumbersOnPage("111", "nope", fixture), []);
});

test("resolveTafsirAyah resolves surah:ayah", () => {
  const r = resolveTafsirAyah("222", 2, 255, fixture);
  assert.equal(r.found, true);
  assert.equal(r.page, "40");
});

test("resolveTafsirAyah: missing ayah → found:false", () => {
  const r = resolveTafsirAyah("222", 1, 1, fixture);
  assert.equal(r.found, false);
  assert.equal(r.reason, "ayah_not_indexed");
});
