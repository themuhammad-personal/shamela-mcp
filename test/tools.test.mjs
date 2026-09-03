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
    nav: { prev: "61", next: "63", last: "7495" },
    volume: "1", printed_page: "36",
    chapter_path: [{ title: "١ - كتاب الإيمان", page: "60" }, { title: "(١) باب بيان الإيمان", page: "61" }],
  },
  "1727/63": {
    paragraphs: ["٢ - (٨) حَدَّثَنِي مُحَمَّدُ بْنُ عُبَيْدٍ الْغُبَرِيُّ …", "٣ - (٨) وَحَدَّثَنِي مُحَمَّدُ بْنُ حَاتِمٍ …"],
    footnotes: [], nav: { prev: "62", next: "64", last: "7495" }, volume: "1", printed_page: "37", chapter_path: [],
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
    recent: async () => ({ books: [] }),
    allBooks: async () => ({ books: [] }),
    ...overrides,
  };
}

const s = createServer(mockClient());
const call = (name, args) => s._registeredTools[name].handler(args);
const json = async (name, args) => JSON.parse((await call(name, args)).content[0].text);

test("server registers 13 tools via registerTool and reports the package version", () => {
  assert.equal(Object.keys(s._registeredTools).length, 13);
  assert.equal(SERVER_VERSION, "2.3.0");
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

test("get_hadith_by_number: live lookup → verified on page, continues across the page break", async () => {
  const d = await json("get_hadith_by_number", { book_id: "1727", hadith_number: "8" });
  assert.equal(d.found, true);
  assert.equal(d.page, "62");
  assert.equal(d.verified_on_page, true);
  assert.ok(d.matn.startsWith("١ - (٨)"));
  assert.ok(d.matn.includes("٣ - (٨)"), "routes of the same number on the next page are appended");
  assert.deepEqual(d.spans_pages, ["62", "63"]);
  assert.deepEqual(d.routes_on_page, ["1"]);
  assert.equal(d.isnad_present, true);
  assert.equal(d.is_canonical_numbering, true);
  assert.equal(d.citation.numbering, "ترقيم محمد فؤاد عبد الباقي");
  assert.equal(d.citation.printed_page, "36");
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

test("get_tafsir_by_ayah degrades gracefully when surah is not in the TOC", async () => {
  const d = await json("get_tafsir_by_ayah", { book_id: "123", surah: 2, ayah: 255 });
  assert.equal(d.found, false);
  assert.equal(d.reason, "surah_not_in_toc");
});

test("get_tafsir_by_ayah: live TOC walk stops on the page whose ﴿…(n)…﴾ marker matches", async () => {
  const pages = {
    "8473/198": { paragraphs: ["تفسير سورة البقرة", "﴿الم (١)﴾ قد اختلف المفسرون"], nav: { next: "199" } },
    "8473/199": { paragraphs: ["﴿ذَلِكَ الْكِتَابُ لا رَيْبَ فِيهِ هُدًى لِلْمُتَّقِينَ (٢)﴾"], nav: { next: "200" } },
    "8473/200": { paragraphs: ["﴿الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ (٣) وَالَّذِينَ يُؤْمِنُونَ بِمَا أُنْزِلَ إِلَيْكَ (٤)﴾ [البقرة: ٣، ٤]"], nav: { next: "201" } },
  };
  const srv = createServer(
    mockClient({
      details: async () => ({ book_id: "8473", title: "تفسير ابن كثير - ت السلامة", toc: [{ title: "فاتحة الكتاب", href: "https://shamela.ws/book/8473/151" }, { title: "تفسير سورة البقرة", href: "https://shamela.ws/book/8473/198" }, { title: "تفسير سورة آل عمران", href: "https://shamela.ws/book/8473/788" }] }),
      bookPage: async (id, p) => ({ book_id: id, page_number: String(p), content: pages[`${id}/${p}`].paragraphs.join("\n"), footnotes: [], chapter_path: [], ...pages[`${id}/${p}`], url: `u/${p}` }),
    }),
  );
  const d = JSON.parse((await srv._registeredTools.get_tafsir_by_ayah.handler({ book_id: "8473", surah: 2, ayah: 4 })).content[0].text);
  assert.equal(d.found, true);
  assert.equal(d.page, "200");
  assert.equal(d.source, "live_toc_walk");
  assert.deepEqual(d.ayahs_marked_on_page, [3, 4]);
  assert.equal(d.is_canonical_numbering, true);
});

test("list_canonical_editions returns the whitelist with provenance", async () => {
  const d = await json("list_canonical_editions", {});
  assert.equal(d.verified_book_ids, 9);
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

test("search_library attaches hadith_numbers deep-link field only when known", async () => {
  const d = await json("search_library", { query: "إيمان", match_mode: "any_words", page: 1 });
  assert.ok(Array.isArray(d.results));
  assert.equal(d.results[0].hadith_numbers, undefined);
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
