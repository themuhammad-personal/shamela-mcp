import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, SERVER_VERSION } from "../src/tools.mjs";

// Offline mock of the shamela client modelled on REAL data:
//   book 1727 (Sahih Muslim ت عبد الباقي): hadith 8 → page 62 («١ - (٨) …»),
//   specialnumber2id clamps out-of-range numbers to the last page (7494).
const PAGES = {
  "1727/62": {
    paragraphs: ["١ - (٨) أَبُو خَيْثَمَةَ زُهَيْرُ بْنُ حَرْبٍ. حَدَّثَنَا وَكِيعٌ …", "كَانَ أَوَّلَ مَنْ قَالَ فِي الْقَدَرِ …", "⦗٣٧⦘", "قَالَ: فَإِنَّهُ جبريل أتاكم يعلمكم دينكم"],
    footnotes: ["(أول من قال بالقدر) معناه أول من قال بنفي القدر"],
    narrator_links: [{ narrator_id: "100", name: "أبو خيثمة", url: "https://shamela.ws/narrator/100", paragraph: 0 }],
    nav: { prev: "61", next: "63", last: "7495" },
    volume: "1", printed_page: "36",
    chapter_path: [{ title: "١ - كتاب الإيمان", page: "60" }, { title: "(١) باب بيان الإيمان", page: "61" }],
  },
  "1727/63": {
    paragraphs: ["٢ - (٨) حَدَّثَنِي مُحَمَّدُ بْنُ عُبَيْدٍ الْغُبَرِيُّ …", "٣ - (٨) وَحَدَّثَنِي مُحَمَّدُ بْنُ حَاتِمٍ …"],
    footnotes: [], narrator_links: [{ narrator_id: "101", name: "محمد بن عبيد", url: "https://shamela.ws/narrator/101", paragraph: 0 }], nav: { prev: "62", next: "64", last: "7495" }, volume: "1", printed_page: "37", chapter_path: [],
  },
  "1727/7494": {
    paragraphs: ["٤٠ - (٣٠٣٣) حَدَّثَنَا أَبُو بَكْرِ بْنُ أَبِي شَيْبَةَ …"],
    footnotes: [], nav: { prev: "7493", next: "7495", last: "7495" }, volume: "4", printed_page: "2323", chapter_path: [],
  },
  "123/10": { paragraphs: ["حدثنا"], footnotes: [], nav: {}, volume: null, printed_page: null, chapter_path: [] },
};

function mockClient(overrides = {}) {
  return {
    categories: async () => [],
    booksByCategory: async () => ({ books: [] }),
    details: async (id) => ({ book_id: id, title: id === "1727" ? "صحيح مسلم - ت عبد الباقي" : "كتاب ما", author: "x", metadata: {}, toc: [] }),
    bookPage: async (id, p) => {
      const d = PAGES[`${id}/${p}`];
      if (!d) throw new Error("Shamela returned HTTP 404");
      return { book_id: id, page_number: String(p), content: d.paragraphs.join("\n"), ...d, book_title: id === "1727" ? "صحيح مسلم - ت عبد الباقي" : "كتاب ما", author: "مسلم", url: `https://shamela.ws/book/${id}/${p}` };
    },
    hadithPageId: async (id, n) => {
      if (id !== "1727") return null; // no numbering service
      if (Number(n) === 8) return "62";
      if (Number(n) >= 3033) return "7494"; // clamp behaviour
      return "62";
    },
    printedPageId: async (id, part, page) => (id === "1727" && part === "1" && page === "36" ? "62" : null),
    titleSearch: async () => ({ results: [{ book_id: "735", title: "صحيح البخاري - ت البغا" }, { book_id: "1681", title: "صحيح البخاري - ط السلطانية" }, { book_id: "5", title: "شرح صحيح البخاري" }], total_available: 3 }),
    searchLibrary: async () => ({ results: [{ book_id: "123", page_id: "10" }] }),
    authorBooks: async () => ({ books: [] }),
    narratorTarjama: async (id) =>
      id === "4210"
        ? { narrator_id: id, url: `https://shamela.ws/narrator/${id}`, found: true, name: "عبد الرزاق بن همام", rank_ibn_hajar: "ثقة حافظ", jarh_wa_tadil: [{ critic: "ابن حجر", statements: [{ text: "ثقة حافظ", source: "تقريب التهذيب (1/ 354)" }] }] }
        : { narrator_id: id, url: `https://shamela.ws/narrator/${id}`, found: false, reason: "no_tarjama_content", fields: {}, jarh_wa_tadil: [] },
    recent: async () => ({ books: [] }),
    allBooks: async () => ({ books: [] }),
    ...overrides,
  };
}

const s = createServer(mockClient());
const call = (name, args) => s._registeredTools[name].handler(args);
const json = async (name, args) => JSON.parse((await call(name, args)).content[0].text);

test("server registers 14 tools via registerTool and reports the package version", () => {
  assert.equal(Object.keys(s._registeredTools).length, 14);
  assert.equal(SERVER_VERSION, "2.5.0");
  assert.ok(s._registeredTools.get_narrator_biography, "Roadmap 3.3 tool present");
  for (const t of Object.values(s._registeredTools)) assert.ok(t.inputSchema, "every tool has an input schema");
});

test("get_book_details: canonical flag comes from the whitelist, not the محقق field", async () => {
  const d = await json("get_book_details", { book_id: "1727" });
  assert.equal(d.is_canonical_numbering, true);
  assert.equal(d.canonical_edition.confidence, "verified");
  const other = await json("get_book_details", { book_id: "123" });
  assert.equal(other.is_canonical_numbering, false);
});

test("search_books_by_name: other edition points at canonical id; sharh flagged derivative", async () => {
  const d = await json("search_books_by_name", { query: "البخاري", page: 1, limit: 10 });
  const byId = Object.fromEntries(d.results.map((r) => [r.book_id, r]));
  assert.equal(byId["1681"].is_canonical_numbering, true);
  assert.equal(byId["735"].is_canonical_numbering, false);
  assert.equal(byId["735"].canonical_edition.canonical_book_id, "1681");
  assert.equal(byId["5"].canonical_edition.derivative, true);
});

test("get_book_page: hadith numbers come from page markers (footnotes excluded), plus structure", async () => {
  const d = await json("get_book_page", { book_id: "1727", page_number: "62" });
  assert.deepEqual(d.hadith_numbers, ["8"]);
  assert.equal(d.hadith_numbers_source, "page_markers");
  assert.equal(d.volume, "1");
  assert.equal(d.printed_page, "36");
  assert.equal(d.footnotes.length, 1);
  assert.deepEqual(d.nav, { prev: "61", next: "63", last: "7495" });
  const plain = await json("get_book_page", { book_id: "123", page_number: "10" });
  assert.deepEqual(plain.hadith_numbers, []);
  assert.equal(plain.hadith_numbers_source, "none");
});

test("get_book_page does not label a numbered paragraph as hadith without edition evidence", async () => {
  const srv = createServer(
    mockClient({
      bookPage: async (id, p) => ({
        book_id: id, page_number: String(p), paragraphs: ["١ - شاهد شعري لا حديث فيه"], footnotes: [],
        content: "١ - شاهد شعري لا حديث فيه", chapter_path: [], nav: {}, volume: null, printed_page: null,
        hadith_number_hint: null, book_title: "كتاب أدب", author: "x", url: `u/${p}`,
      }),
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_book_page.handler({ book_id: "123", page_number: "10" })).content[0].text);
  assert.deepEqual(d.hadith_numbers, []);
  assert.equal(d.hadith_numbers_source, "none");
});

test("get_hadith_by_number: live lookup → verified on page, continues across the page break", async () => {
  const d = await json("get_hadith_by_number", { book_id: "1727", hadith_number: "8" });
  assert.equal(d.found, true);
  assert.equal(d.page, "62");
  assert.equal(d.verified_on_page, true);
  assert.ok(d.matn.startsWith("١ - (٨)"));
  assert.ok(d.matn.includes("٣ - (٨)"), "routes of the same number on the next page are appended");
  assert.deepEqual(d.spans_pages, ["62", "63"]);
  assert.deepEqual(d.routes_on_page, ["1"]);
  assert.deepEqual(d.narrator_links.map((link) => link.narrator_id), ["100", "101"]);
  assert.equal(d.isnad_present, true);
  assert.equal(d.is_canonical_numbering, true);
  assert.equal(d.citation.numbering, "ترقيم محمد فؤاد عبد الباقي");
  assert.equal(d.citation.printed_page, "36");
});

test("get_hadith_by_number: Muwatta ambiguity and resolved kitab are unavoidable at top level", async () => {
  const srv = createServer(mockClient({
    hadithPageId: async () => "2643",
    bookPage: async () => ({
      book_id: "1699", page_number: "2643", paragraphs: ["١ - حَدَّثَنِي مَالِكٌ …"], narrator_links: [], footnotes: [],
      nav: {}, volume: "2", printed_page: "999", chapter_path: [{ title: "كتاب أسماء النبي صلى الله عليه وسلم", page: "2640" }],
      book_title: "موطأ مالك - رواية يحيى - ت عبد الباقي", author: "مالك", url: "https://shamela.ws/book/1699/2643",
    }),
  }));
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1699", hadith_number: "1" })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.numbering_ambiguous, true);
  assert.equal(d.resolved_kitab, "كتاب أسماء النبي صلى الله عليه وسلم");
  assert.match(d.warning, /প্রতি কিতাবে/);
});

test("get_hadith_by_number: globally numbered books are not marked ambiguous", async () => {
  const d = await json("get_hadith_by_number", { book_id: "1727", hadith_number: "8" });
  assert.equal(d.numbering_ambiguous, false);
  assert.equal(d.warning, undefined);
});

test("get_hadith_by_number: out-of-range number is refused BEFORE hitting the network", async () => {
  let called = false;
  const srv = createServer(mockClient({ hadithPageId: async () => ((called = true), "7494") }));
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1727", hadith_number: "99999" })).content[0].text);
  assert.equal(d.found, false);
  assert.equal(d.reason, "out_of_range");
  assert.equal(d.last_number, 3033);
  assert.equal(called, false);
});

test("get_hadith_by_number: shamela points at a page but the marker is absent → found:false, never a guess", async () => {
  const srv = createServer(mockClient({ hadithPageId: async () => "7494" }));
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1727", hadith_number: "3000" })).content[0].text);
  assert.equal(d.found, false);
  assert.equal(d.reason, "marker_not_on_page");
  assert.deepEqual(d.numbers_on_page, ["3033"]);
  assert.equal(d.page_data, undefined, "raw page not dumped; a preview is enough");
  assert.ok(d.page_preview.first_paragraph);
});

test("get_hadith_by_number: book without numbering service → found:false with canonical hint", async () => {
  const d = await json("get_hadith_by_number", { book_id: "123", hadith_number: "8" });
  assert.equal(d.found, false);
  assert.match(d.reason, /no_hadith_numbering/);
  assert.equal(d.index_status.books, undefined, "compact index status");
  assert.equal(typeof d.canonical_map.verified_book_ids, "number");
  const other = await json("get_hadith_by_number", { book_id: "735", hadith_number: "8" });
  assert.match(other.hint, /1681/);
});

test("get_tafsir_by_ayah: book without a persisted tafsir index → found:false, no page walk", async () => {
  let fetched = 0;
  const srv = createServer(mockClient({ bookPage: async () => { fetched += 1; throw new Error("must not fetch"); } }));
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "123", surah: 2, ayah: 255 })).content[0].text);
  assert.equal(d.found, false);
  assert.equal(d.reason, "no_tafsir_index_for_book");
  assert.equal(fetched, 0);
  assert.match(d.hint, /build-tafsir-index/);
  assert.equal(d.index_status.books, undefined);
});

test("get_tafsir_by_ayah: indexed ayah is answered from the persisted index with ONE page fetch", async () => {
  const fetched = [];
  const srv = createServer(
    mockClient({
      bookPage: async (id, p) => {
        fetched.push(`${id}/${p}`);
        return { book_id: id, page_number: String(p), paragraphs: ["﴿اللَّهُ لا إِلَهَ إِلا هُوَ الْحَيُّ الْقَيُّومُ … (٢٥٥)﴾"], content: "…", footnotes: [], chapter_path: [], nav: { prev: "720", next: "722" }, volume: "1", printed_page: "678", url: `u/${p}` };
      },
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "8473", surah: 2, ayah: 255 })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.page, "721", "verified live: Baqarah 255 block starts on 8473/721");
  assert.equal(d.precision, "exact");
  assert.equal(d.source, "static_index");
  assert.equal(d.verified_on_page, true);
  assert.deepEqual(fetched, ["8473/721"]);
  assert.equal(d.is_canonical_numbering, true);
});

test("get_tafsir_by_ayah refuses a stale static page when its ayah marker is absent", async () => {
  const fetched = [];
  const srv = createServer(
    mockClient({
      bookPage: async (id, p) => {
        fetched.push(`${id}/${p}`);
        return { book_id: id, page_number: String(p), paragraphs: ["شرح عام بلا رقم آية"], content: "…", footnotes: [], chapter_path: [], nav: {}, volume: "1", printed_page: "678", url: `u/${p}` };
      },
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "8473", surah: 2, ayah: 255 })).content[0].text);
  assert.equal(d.found, false);
  assert.equal(d.reason, "static_index_marker_not_on_page");
  assert.deepEqual(fetched, ["8473/721"]);
});

test("get_tafsir_by_ayah: unindexed ayah → bounded bisection INSIDE the surah range (≤ 20 fetches, precision labelled)", async () => {
  // Real ranges from the shipped index: al-Ankabut = 3168..3201, with 29:1-4 → 3168 and 29:5-9 → 3169 seeded.
  const fetched = [];
  const srv = createServer(
    mockClient({
      bookPage: async (id, p) => {
        fetched.push(Number(p));
        const n = Number(p);
        // ayah blocks of 3 every 2 pages from 3170 (ayahs 10..)
        const block = n >= 3170 && (n - 3170) % 2 === 0 ? [10 + ((n - 3170) / 2) * 3, 11 + ((n - 3170) / 2) * 3, 12 + ((n - 3170) / 2) * 3] : null;
        return { book_id: id, page_number: String(p), paragraphs: block ? [`﴿${block.map((a) => `… (${a})`).join(" ")}﴾`] : ["شرح (١)"], content: "…", footnotes: [], chapter_path: [], nav: { prev: String(n - 1), next: String(n + 1) }, volume: "6", printed_page: "1", url: `u/${p}` };
      },
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "8473", surah: 29, ayah: 20 })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.precision, "exact");
  assert.equal(d.source, "bounded_search");
  assert.equal(d.page, "3176"); // ayahs 19,20,21
  assert.deepEqual(d.ayahs_marked_on_page, [19, 20, 21]);
  assert.deepEqual(d.surah_range, { start: "3168", end: "3201" });
  const probes = fetched.slice(0, -1); // last fetch is the final page read for the passage
  assert.ok(probes.length <= 20, `probes ${probes.length}`);
  assert.ok(probes.every((p) => p >= 3169 && p <= 3201), `probes stayed inside the surah: ${probes}`);
});

test("get_tafsir_by_ayah: al-Fatiha (no ﴿…﴾ blocks in Ibn Kathir) → surah start page with an honest precision flag", async () => {
  const fetched = [];
  const srv = createServer(
    mockClient({
      bookPage: async (id, p) => {
        fetched.push(Number(p));
        return { book_id: id, page_number: String(p), paragraphs: ["(إِيَّاكَ ��َعْبُدُ وَإِيَّاكَ نَسْتَعِينُ) قرأ السبعة (١)"], content: "…", footnotes: ["(١) في جـ"], chapter_path: [], nav: {}, volume: "1", printed_page: "134", url: `u/${p}` };
      },
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "8473", surah: 1, ayah: 5 })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.page, "151");
  assert.equal(d.precision, "surah_start");
  assert.ok(d.note);
  assert.ok(fetched.every((p) => p >= 151 && p <= 197), `fetched ${fetched}`);
  assert.ok(fetched.length <= 21);
});

test("list_canonical_editions returns the whitelist with provenance", async () => {
  const d = await json("list_canonical_editions", {});
  assert.equal(d.verified_book_ids, 11);
  assert.deepEqual(
    d.editions.filter((e) => e.type === "tafsir").map((e) => e.book_id).sort(),
    ["20855", "7798", "8473"],
    "Ibn Kathir, Tabari (ت التركي) and Qurtubi (دار الكتب المصرية) are the verified tafsir editions",
  );
  assert.ok(d.editions.find((e) => e.key === "sahih-al-bukhari").book_id === "1681");
});

test("get_page_by_printed_number resolves via pagenum2id", async () => {
  const d = await json("get_page_by_printed_number", { book_id: "1727", volume: "1", printed_page: "36" });
  assert.equal(d.found, true);
  assert.equal(d.page_number, "62");
  assert.deepEqual(d.hadith_numbers, ["8"]);
  const miss = await json("get_page_by_printed_number", { book_id: "1727", volume: "9", printed_page: "1" });
  assert.equal(miss.found, false);
});

test("search_library: hadith_numbers key is ABSENT (not undefined/empty) when the index does not know the page, and the response says why", async () => {
  const d = await json("search_library", { query: "إيمان", match_mode: "any_words", page: 1 });
  assert.ok(Array.isArray(d.results));
  assert.equal(Object.hasOwn(d.results[0], "hadith_numbers"), false);
  assert.match(d.hadith_numbers_note, /hadith_numbers/);
  assert.match(d.hadith_numbers_note, /get_book_page/);
});

test("search_library description does not promise fields the payload cannot carry", async () => {
  const desc = s._registeredTools.search_library.description;
  assert.doesNotMatch(desc, /ayah রেফারেন্সও থাকে/);
  assert.match(desc, /get_book_page/);
  assert.match(desc, /hadith_numbers ফিল্ড কেবল তখনই/);
});

// --- editorial gradings surfaced by get_hadith_by_number -------------------

test("get_hadith_by_number surfaces «[حكم الألباني]» from the page footnotes (Tirmidhi 1435 shape)", async () => {
  const srv = createServer(
    mockClient({
      hadithPageId: async (id, n) => (id === "1435" && String(n) === "1" ? "3" : null),
      bookPage: async (id, p) => ({
        book_id: id, page_number: String(p), volume: "1", printed_page: "5", chapter_path: [], nav: {}, url: `u/${p}`,
        paragraphs: ["١ - حَدَّثَنَا قُتَيْبَةُ بْنُ سَعِيدٍ … هَذَا حَدِيثٌ حَسَنٌ صَحِيحٌ"],
        content: "…",
        footnotes: ["[حكم الألباني] : صحيح"],
      }),
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1435", hadith_number: 1 })).content[0].text);
  assert.equal(d.found, true);
  assert.deepEqual({ grader: d.grading.grader, verdict: d.grading.verdict, verdict_class: d.grading.verdict_class }, { grader: "الألباني", verdict: "صحيح", verdict_class: "sahih" });
  assert.equal(d.grading.attribution, "only_grading_on_page");
  assert.equal(d.grading.page, "3");
  assert.equal(d.gradings_on_page.length, 1);
});

test("get_hadith_by_number: Ibn Majah shape (label + newline) and Abu Dawud «حسن صحيح»", async () => {
  const mk = (foot) =>
    createServer(
      mockClient({
        hadithPageId: async () => "4",
        bookPage: async (id, p) => ({ book_id: id, page_number: String(p), paragraphs: ["١ - حَدَّثَنَا …"], content: "…", footnotes: [foot], chapter_path: [], nav: {}, url: "u" }),
      }),
    );
  const ibnMajah = JSON.parse((await mk("[حكم الألباني]\nصحيح")._registeredTools.get_hadith_by_number.handler({ book_id: "1198", hadith_number: 1 })).content[0].text);
  assert.equal(ibnMajah.grading.verdict, "صحيح");
  const abuDawud = JSON.parse((await mk("[حكم الألباني] : حسن صحيح")._registeredTools.get_hadith_by_number.handler({ book_id: "1726", hadith_number: 1 })).content[0].text);
  assert.equal(abuDawud.grading.verdict, "حسن صحيح");
  assert.equal(abuDawud.grading.verdict_class, "hasan_sahih");
});

test("get_hadith_by_number: no grading field is invented for Bukhari/Muslim/Musnad pages", async () => {
  const d = await json("get_hadith_by_number", { book_id: "1727", hadith_number: 8 });
  assert.equal(d.found, true);
  assert.equal(d.grading, null);
  assert.equal(d.gradings_on_page, undefined);
  assert.equal(d.grading_note, undefined);
});

test("get_hadith_by_number: two hadiths + one verdict on a page → grading null, verdicts listed, note explains", async () => {
  const srv = createServer(
    mockClient({
      hadithPageId: async () => "9",
      bookPage: async (id, p) => ({
        book_id: id, page_number: String(p), chapter_path: [], nav: {}, url: "u", content: "…",
        paragraphs: ["٥ - حَدَّثَنَا …", "٦ - حَدَّثَنَا …"],
        footnotes: ["[حكم الألباني] : ضعيف"],
      }),
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1435", hadith_number: 6 })).content[0].text);
  assert.equal(d.grading, null);
  assert.deepEqual(d.gradings_on_page.map((g) => g.verdict), ["ضعيف"]);
  assert.ok(d.grading_note);
});


test("get_hadith_by_number exposes when the bounded continuation cap leaves text incomplete", async () => {
  const srv = createServer(
    mockClient({
      hadithPageId: async () => "1",
      bookPage: async (id, p) => {
        const page = Number(p);
        return {
          book_id: id, page_number: String(page), chapter_path: [], url: `u/${page}`, content: `page ${page}`,
          paragraphs: [page === 1 ? "١ - حَدَّثَنَا …" : `continuation ${page}`],
          footnotes: [], nav: { next: String(page + 1) },
        };
      },
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_hadith_by_number.handler({ book_id: "123", hadith_number: 1 })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.continuation_complete, false);
  assert.equal(d.continuation_issue, "continuation_limit_reached");
  assert.match(d.continuation_note, /limit|সীমা/i);
});

test("get_page_by_printed_number does not classify numbered prose from an unknown edition", async () => {
  const srv = createServer(
    mockClient({
      printedPageId: async () => "10",
      bookPage: async (id, p) => ({
        book_id: id, page_number: String(p), paragraphs: ["١ - شاهد شعري"], footnotes: [],
        content: "١ - شاهد شعري", chapter_path: [], nav: {}, hadith_number_hint: null,
        volume: "1", printed_page: "5", book_title: "كتاب أدب", author: "x", url: `u/${p}`,
      }),
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_page_by_printed_number.handler({ book_id: "123", volume: "1", printed_page: "5" })).content[0].text);
  assert.deepEqual(d.hadith_numbers, []);
});

// --- structured failures --------------------------------------------------

function failingClient(error) {
  const boom = async () => {
    throw error;
  };
  return {
    categories: boom, booksByCategory: boom, details: boom, bookPage: boom, hadithPageId: boom, printedPageId: boom,
    titleSearch: boom, searchLibrary: boom, authorBooks: boom, recent: boom, allBooks: boom,
  };
}

const failCall = async (error, name, args) => {
  const srv = createServer(failingClient(error));
  const out = await srv._registeredTools[name].handler(args);
  return { out, data: JSON.parse(out.content[0].text) };
};

test("upstream failure returns a structured error, not a bare runtime message", async () => {
  const { out, data } = await failCall(new Error("Network connection lost."), "get_categories", {});
  assert.equal(out.isError, true);
  assert.equal(data.ok, false);
  assert.equal(data.tool, "get_categories");
  assert.equal(data.error, "network");
  assert.ok(data.hint && data.hint.length > 10);
  assert.equal(data.fabricated, false);
});

test("shamela HTTP 429 is classified as rate-limiting", async () => {
  const { data } = await failCall(new Error("Shamela returned HTTP 429"), "get_book_details", { book_id: "1" });
  assert.equal(data.error, "upstream_http");
  assert.equal(data.status, 429);
  assert.match(data.hint, /rate-limit/);
});

test("HTTP 200 challenge/empty bodies are classified as upstream_invalid", async () => {
  const error = new Error("Shamela returned an unusable response: HTTP 200 challenge page");
  error.code = "SHAMELA_INVALID_BODY";
  const { data } = await failCall(error, "get_categories", {});
  assert.equal(data.error, "upstream_invalid");
  assert.equal(data.fabricated, false);
});

test("errors never leak a stack trace", async () => {
  const { out, data } = await failCall(new Error("kaboom"), "get_categories", {});
  const raw = out.content[0].text;
  assert.equal(raw.includes("at Object."), false);
  assert.equal(data.stack, undefined);
  assert.equal(raw.includes("kaboom"), true);
});

test("stack frames are stripped even when they arrive inside the message", async () => {
  const { out } = await failCall(new Error("boom\n    at Object.<anonymous> (/src/tools.mjs:1:1)"), "get_categories", {});
  assert.equal(out.content[0].text.includes("at Object."), false);
});

test("get_hadith_by_number: live failure is a structured error too", async () => {
  const { out, data } = await failCall(new Error("Shamela returned HTTP 503"), "get_hadith_by_number", { book_id: "1727", hadith_number: "8" });
  assert.equal(out.isError, true);
  assert.equal(data.status, 503);
});

test("get_narrator_biography: passes the parsed card through and never invents a verdict", async () => {
  const r = await json("get_narrator_biography", { narrator_id: "4210" });
  assert.equal(r.found, true);
  assert.equal(r.name, "عبد الرزاق بن همام");
  assert.equal(r.rank_ibn_hajar, "ثقة حافظ");
  assert.equal(r.jarh_wa_tadil[0].statements[0].source, "تقريب التهذيب (1/ 354)");
  assert.equal("reliability" in r, false);
  assert.match(r.note, /হুবহু/);
  const miss = await json("get_narrator_biography", { narrator_id: "999999" });
  assert.equal(miss.found, false);
  assert.equal(miss.reason, "no_tarjama_content");
  assert.match(miss.note, /narrator_id/);
});
