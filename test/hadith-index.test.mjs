import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveHadith,
  resolveTafsirAyah,
  resolveTafsirAyahBounded,
  tafsirSurahRange,
  surahStartsFromToc,
  surahRangesFromStarts,
  hadithNumbersOnPage,
  indexStatus,
} from "../src/lib/hadith-index.mjs";
import shippedTafsirIndex from "../src/data/tafsir-index.mjs";
import { AYAH_COUNTS } from "../src/lib/citation-detect.mjs";

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

const NO_TAFSIR = { generated_at: null, books: {} };

test("indexStatus reports seed state", () => {
  const empty = indexStatus({ generated_at: null, books: {} }, NO_TAFSIR);
  assert.equal(empty.books_indexed, 0);
  assert.equal(indexStatus(fixture, NO_TAFSIR).books_indexed, 2);
});

test("indexStatus merges the shipped tafsir index (8473 with 114 surah ranges)", () => {
  const s = indexStatus({ generated_at: null, books: {} });
  assert.ok(s.indexed_book_ids.includes("8473"));
  assert.equal(s.tafsir_books, 1);
  assert.equal(s.surah_ranges, 114);
  assert.ok(s.ayah_entries > 0);
  assert.equal(s.books, undefined);
});

test("indexStatus is a summary — it must never dump the raw index", () => {
  // This object is attached to EVERY `found: false` answer. Once the index is
  // actually built it can be hundreds of KB; leaking it would bury the one
  // thing the caller needs (why the lookup missed) in payload.
  const s = indexStatus(fixture, NO_TAFSIR);
  assert.equal(s.books, undefined, "raw books object is not exposed");
  assert.deepEqual(s.indexed_book_ids, ["111", "222"]);
  assert.equal(s.hadith_books, 1);
  assert.equal(s.tafsir_books, 1);
  assert.equal(s.hadith_entries, 2);
  assert.equal(s.ayah_entries, 1);
  assert.ok(JSON.stringify(s).length < 400, `summary stayed small: ${JSON.stringify(s).length} bytes`);
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

// ---------------------------------------------------------------------------
// Persisted tafsir index (src/data/tafsir-index.mjs) — Ibn Kathir 8473
// ---------------------------------------------------------------------------

test("shipped tafsir index: 8473 has a contiguous, monotonic range for every surah", () => {
  const b = shippedTafsirIndex.books["8473"];
  assert.equal(b.type, "tafsir");
  for (let n = 1; n <= 114; n += 1) assert.ok(b.surahs[String(n)], `surah ${n} missing`);
  // verified live 2026-09-03
  assert.deepEqual([b.surahs["1"].start, b.surahs["1"].end], ["151", "197"]);
  assert.equal(b.surahs["2"].start, "198");
  assert.equal(b.surahs["26"].start, "3040", "al-Shu'ara has no TOC entry — seeded from the page heading");
  assert.equal(b.surahs["26"].source, "page_heading");
  assert.equal(b.surahs["29"].start, "3168", "al-Ankabut has no TOC entry — seeded from the page heading");
  assert.equal(b.surahs["25"].end, "3039");
  assert.equal(b.surahs["28"].end, "3167");
  assert.equal(b.surahs["113"].start, "4576");
  assert.equal(b.surahs["113"].end, "4583", "shared «سورتي المعوذتين» heading must stop before al-Nas's own entry");
  assert.equal(b.surahs["114"].start, "4584");
  assert.equal(b.surahs["114"].end, b.last_page);
  for (let n = 1; n < 114; n += 1) {
    const cur = b.surahs[String(n)];
    const next = b.surahs[String(n + 1)];
    assert.ok(Number(cur.start) <= Number(cur.end), `surah ${n} start<=end`);
    assert.ok(Number(cur.start) <= Number(next.start), `surah ${n} before ${n + 1}`);
  }
  // every seeded ayah lies inside its surah's range and is a valid ayah number
  for (const [key, page] of Object.entries(b.ayahs)) {
    const [s, a] = key.split(":").map(Number);
    assert.ok(a >= 1 && a <= AYAH_COUNTS[s], `${key} valid ayah`);
    const r = b.surahs[String(s)];
    assert.ok(Number(page) >= Number(r.start) && Number(page) <= Number(r.end), `${key} → ${page} inside ${r.start}-${r.end}`);
  }
});

test("resolveTafsirAyah answers from the shipped index in O(1) with precision exact", () => {
  assert.deepEqual([resolveTafsirAyah("8473", 2, 255).page, resolveTafsirAyah("8473", 2, 255).precision], ["721", "exact"]);
  assert.equal(resolveTafsirAyah("8473", 29, 5).page, "3169");
  assert.equal(resolveTafsirAyah("8473", 68, 1).page, "4230");
  const miss = resolveTafsirAyah("8473", 2, 100);
  assert.equal(miss.found, false);
  assert.deepEqual(miss.surah_range, tafsirSurahRange("8473", 2), "a miss still tells the caller where the surah lives");
});

// A synthetic 40-page surah: ayah blocks every 4 pages, commentary in between.
function fakeSurahBook({ start = 100, end = 139, blockEvery = 4, ayahsPerBlock = 3, surah = 2 } = {}) {
  const pages = {};
  let ayah = 1;
  for (let p = start; p <= end; p += 1) {
    if ((p - start) % blockEvery === 0) {
      const nums = Array.from({ length: ayahsPerBlock }, (_, i) => ayah + i);
      ayah += ayahsPerBlock;
      pages[p] = { paragraphs: [`﴿${nums.map((n) => `… (${n})`).join(" ")}﴾`, "شرح"], nav: { prev: String(p - 1), next: String(p + 1) } };
    } else pages[p] = { paragraphs: ["شرح طويل (١) بلا آية", "وقال ابن عباس (٢)"], nav: { prev: String(p - 1), next: String(p + 1) } };
  }
  const idx = { generated_at: null, books: { "777": { type: "tafsir", last_page: String(end + 50), surahs: { [surah]: { start: String(start), end: String(end) } }, ayahs: {} } } };
  const fetched = [];
  const client = {
    bookPage: async (id, p) => {
      fetched.push(Number(p));
      const pg = pages[Number(p)];
      if (!pg) throw new Error(`page ${p} outside fixture`);
      return { book_id: id, page_number: String(p), ...pg };
    },
  };
  return { idx, client, fetched, pages };
}

test("resolveTafsirAyahBounded bisects inside the surah range and never leaves it", async () => {
  const { idx, client, fetched } = fakeSurahBook();
  // ayah 20 → block index 6 (ayahs 19,20,21) → page 100 + 6*4 = 124
  const r = await resolveTafsirAyahBounded(client, "777", 2, 20, { index: idx });
  assert.equal(r.found, true);
  assert.equal(r.page, "124");
  assert.equal(r.precision, "exact");
  assert.deepEqual(r.ayahs_marked_on_page, [19, 20, 21]);
  assert.ok(r.pages_fetched <= 20, `fetched ${r.pages_fetched}`);
  assert.ok(fetched.every((p) => p >= 100 && p <= 139), "no fetch outside the surah range");
  assert.equal(r.source, "bounded_search");
});

test("resolveTafsirAyahBounded uses indexed neighbours to tighten bounds", async () => {
  const { idx, client, fetched } = fakeSurahBook();
  idx.books["777"].ayahs["2:19"] = "124";
  idx.books["777"].ayahs["2:25"] = "132";
  const r = await resolveTafsirAyahBounded(client, "777", 2, 23, { index: idx });
  assert.equal(r.page, "128");
  assert.ok(fetched.every((p) => p >= 124 && p <= 132), `fetched ${fetched}`);
  assert.ok(r.pages_fetched <= 6, `fetched ${r.pages_fetched}`); // 9-page window → forward walk 124..128
});

test("resolveTafsirAyahBounded: first/last ayah of the surah", async () => {
  const { idx, client } = fakeSurahBook();
  assert.equal((await resolveTafsirAyahBounded(client, "777", 2, 1, { index: idx })).page, "100");
  assert.equal((await resolveTafsirAyahBounded(client, "777", 2, 30, { index: idx })).page, "136");
});

test("resolveTafsirAyahBounded respects the fetch budget and labels an inexact answer", async () => {
  // 240-page surah, one 3-ayah block every 4 pages → ayah 100 lives on page 100 + 33*4 = 232.
  const { idx, client, fetched } = fakeSurahBook({ end: 100 + 4 * 60 - 1 });
  const r = await resolveTafsirAyahBounded(client, "777", 2, 100, { index: idx, maxFetches: 3 });
  assert.ok(fetched.length <= 3, `budget exceeded: ${fetched.length}`);
  assert.equal(r.pages_fetched, fetched.length);
  if (r.found) {
    assert.equal(r.precision, "nearest_before", "an inexact answer must be labelled");
    assert.ok(r.ayahs_marked_on_page.every((a) => a < 100));
    assert.ok(r.note);
  } else assert.equal(r.reason, "ayah_not_located_within_budget");
  // with a sane budget the same lookup is exact
  const ok = await resolveTafsirAyahBounded(client, "777", 2, 100, { index: idx, maxFetches: 20 });
  assert.equal(ok.precision, "exact");
  assert.equal(ok.page, "232");
});

test("resolveTafsirAyahBounded: surah with no ﴿…﴾ blocks (al-Fatiha style) → surah_start, never a guessed ayah page", async () => {
  const idx = { generated_at: null, books: { "777": { type: "tafsir", surahs: { "1": { start: "151", end: "160" } }, ayahs: {} } } };
  const fetched = [];
  const client = { bookPage: async (id, p) => { fetched.push(Number(p)); return { paragraphs: ["(إِيَّاكَ نَعْبُدُ) أي (١)", "* * *", "(١) في جـ"], nav: {} }; } };
  const r = await resolveTafsirAyahBounded(client, "777", 1, 5, { index: idx });
  assert.equal(r.found, true);
  assert.equal(r.page, "151");
  assert.equal(r.precision, "surah_start");
  assert.ok(r.note);
  assert.ok(fetched.every((p) => p >= 151 && p <= 160));
  assert.ok(fetched.length <= 20);
});

test("resolveTafsirAyahBounded refuses unknown book / surah / ayah", async () => {
  const idx = { generated_at: null, books: { "777": { type: "tafsir", surahs: { "2": { start: "1", end: "9" } }, ayahs: {} } } };
  const client = { bookPage: async () => { throw new Error("must not fetch"); } };
  assert.equal((await resolveTafsirAyahBounded(client, "1", 2, 1, { index: idx })).reason, "no_tafsir_index_for_book");
  const s = await resolveTafsirAyahBounded(client, "777", 3, 1, { index: idx });
  assert.equal(s.reason, "surah_not_indexed");
  assert.deepEqual(s.surahs_indexed, [2]);
  assert.equal((await resolveTafsirAyahBounded(client, "777", 2, 287, { index: idx })).reason, "ayah_out_of_range");
});

test("surahStartsFromToc + surahRangesFromStarts reproduce the 8473 layout", () => {
  const toc = [
    { title: "مقدمة ابن كثير", href: "https://shamela.ws/book/8473/1" },
    { title: "فاتحة الكتاب", href: "https://shamela.ws/book/8473/151" },
    { title: "تفسير سورة البقرة", href: "https://shamela.ws/book/8473/198" },
    { title: "الآية: ٢٥٥", href: "https://shamela.ws/book/8473/721" },
    { title: "تفسير سورة آل عمران", href: "https://shamela.ws/book/8473/788" },
    { title: "تفسير سورة الإخلاص", href: "https://shamela.ws/book/8473/4564" },
    { title: "تفسير سورتي المعوذتين", href: "https://shamela.ws/book/8473/4576" },
    { title: "سورة الناس", href: "https://shamela.ws/book/8473/4584" },
  ];
  const starts = surahStartsFromToc(toc);
  assert.equal(starts.get(1).page, "151");
  assert.equal(starts.get(113).source, "toc_shared_heading");
  assert.equal(starts.get(114).source, "toc", "dedicated heading wins over the shared one");
  assert.equal(starts.has(0), false);
  const ranges = surahRangesFromStarts(starts, "4588");
  assert.deepEqual(ranges["2"], { start: "198", end: "787", heading: "تفسير سورة البقرة", source: "toc" });
  assert.deepEqual([ranges["113"].start, ranges["113"].end, ranges["114"].start, ranges["114"].end], ["4576", "4583", "4584", "4588"]);
});
