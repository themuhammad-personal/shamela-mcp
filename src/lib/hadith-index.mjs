/**
 * Citation-addressable resolution (Roadmap Phase 2).
 *
 * Two layers, both of which refuse to guess:
 *
 *  1. STATIC INDEX
 *     - `src/data/hadith-index.mjs` (scripts/build-hadith-index.mjs):
 *       O(1) `hadith_number → page` and `page → [numbers]` maps.
 *     - `src/data/tafsir-index.mjs` (scripts/build-tafsir-index.mjs):
 *       `surah → {start,end}` page ranges and `surah:ayah → page`.
 *
 *  2. LIVE LOOKUP  (`resolveHadithLive`): shamela's own
 *     `GET /ajax/specialnumber2id/<book>/<n>` — the endpoint behind the
 *     "رقم الحديث / الرقم المسلسل" box on every hadith page — followed by a
 *     fetch of that page and a check that the marker «n - …» really is on it.
 *     shamela returns the *last* page for out-of-range numbers, so the on-page
 *     check is not optional.
 *
 *  3. BOUNDED TAFSIR LOOKUP (`resolveTafsirAyahBounded`): when an ayah is not
 *     in the static map, bisect *inside the surah's persisted page range*
 *     (≤ `maxFetches` page reads, default 20). It never walks a book from the
 *     TOC at request time and never leaves the surah's range.
 *
 * `{ found: false, reason }` is the answer whenever a layer cannot prove
 * the number; never a fabricated page.
 */

import index from "../data/hadith-index.mjs";
import tafsirIndex from "../data/tafsir-index.mjs";
import { detectHadithMarkers, extractHadith, surahsFromHeading, isAyahHeading, detectQuranBracketAyahs, AYAH_COUNTS } from "./citation-detect.mjs";
import { canonicalRecord } from "../canonical-editions.mjs";

export function indexStatus(idx = index, tIdx = tafsirIndex) {
  const books = { ...(tIdx?.books ?? {}), ...(idx.books ?? {}) };
  const ids = Object.keys(books);
  let hadith_books = 0;
  let tafsir_books = 0;
  let hadith_entries = 0;
  let ayah_entries = 0;
  let surah_ranges = 0;
  for (const b of Object.values(books)) {
    if (b?.type === "hadith") {
      hadith_books += 1;
      hadith_entries += Object.keys(b.index ?? {}).length;
    } else if (b?.type === "tafsir") {
      tafsir_books += 1;
      ayah_entries += Object.keys(b.ayahs ?? {}).length;
      surah_ranges += Object.keys(b.surahs ?? {}).length;
    }
  }
  return {
    generated_at: idx.generated_at ?? null,
    tafsir_generated_at: tIdx?.generated_at ?? null,
    books_indexed: ids.length,
    indexed_book_ids: ids,
    hadith_books,
    tafsir_books,
    hadith_entries,
    surah_ranges,
    ayah_entries,
  };
}

/** Static-index lookup only (synchronous). */
export function resolveHadith(bookId, hadithNumber, idx = index) {
  const book = idx.books?.[String(bookId)];
  const num = String(hadithNumber);
  if (!book || book.type !== "hadith") {
    return { found: false, reason: "no_hadith_index_for_book", hadith_number: num };
  }
  const entry = book.index?.[num];
  if (!entry) return { found: false, reason: "hadith_number_not_indexed", hadith_number: num };
  return { found: true, book_id: String(bookId), hadith_number: num, page: entry.page, note: entry.note, source: "static_index" };
}

/** Reverse lookup from the static index. */
export function hadithNumbersOnPage(bookId, page, idx = index) {
  const book = idx.books?.[String(bookId)];
  if (!book || book.type !== "hadith") return [];
  return book.reverse?.[String(page)] ?? [];
}

const pageOf = (entry) => (entry && typeof entry === "object" ? entry.page : entry);

/** Surah page range from the persisted tafsir index, or null. */
export function tafsirSurahRange(bookId, surah, tIdx = tafsirIndex) {
  const book = tIdx.books?.[String(bookId)];
  const r = book?.type === "tafsir" ? book.surahs?.[String(surah)] : null;
  return r ? { start: String(r.start), end: String(r.end), heading: r.heading, source: r.source } : null;
}

/**
 * Static-index tafsir lookup only (synchronous, O(1)).
 * Looks in `src/data/tafsir-index.mjs`; a legacy `books[id].ayahs[key].page`
 * shape (old hadith-index seed / test fixtures) is accepted too.
 */
export function resolveTafsirAyah(bookId, surah, ayah, idx = tafsirIndex) {
  const book = idx.books?.[String(bookId)];
  const key = `${surah}:${ayah}`;
  if (!book || book.type !== "tafsir") {
    return { found: false, reason: "no_tafsir_index_for_book", key };
  }
  const entry = book.ayahs?.[key];
  if (!entry) return { found: false, reason: "ayah_not_indexed", key, surah_range: tafsirSurahRange(bookId, surah, idx) ?? undefined };
  return { found: true, book_id: String(bookId), surah, ayah, page: String(pageOf(entry)), precision: "exact", note: entry.note, source: "static_index" };
}

/**
 * Live resolution via shamela's specialnumber2id + on-page verification.
 *
 * @param {object} client  `createClient()` instance (needs hadithPageId, bookPage)
 * @returns {Promise<object>} found:true → { page, hadith:{text,paragraphs,...}, page_data }
 *   found:false → { reason: "book_has_no_hadith_numbering" | "hadith_number_not_found" | "marker_not_on_page" | "out_of_range" }
 */
export async function resolveHadithLive(client, bookId, hadithNumber, { maxContinuationPages = 2 } = {}) {
  const num = String(hadithNumber);
  const rec = canonicalRecord(bookId);
  if (rec?.last_number && Number(num) > rec.last_number) {
    return { found: false, reason: "out_of_range", hadith_number: num, last_number: rec.last_number };
  }
  const page = await client.hadithPageId(bookId, num);
  if (!page) return { found: false, reason: "book_has_no_hadith_numbering_or_number_not_found", hadith_number: num };

  const pageData = await client.bookPage(bookId, page);
  const markers = detectHadithMarkers(pageData.paragraphs);
  const hit = extractHadith(pageData.paragraphs, num);
  if (!hit) {
    return {
      found: false,
      reason: "marker_not_on_page",
      hadith_number: num,
      page,
      numbers_on_page: markers.map((m) => m.number),
      hint: "shamela pointed at this page but the number is not printed at a paragraph start here (out-of-range numbers return the last page; some editions skip/duplicate numbers). Read the page yourself with get_book_page.",
      page_data: pageData,
    };
  }

  // Continue onto following pages while the hadith runs past the page break.
  const chunks = [pageData];
  let text = hit.text;
  let cursor = pageData;
  for (let i = 0; i < maxContinuationPages && hit.ends_at_page_end && cursor.nav?.next; i += 1) {
    let nextPage;
    try {
      nextPage = await client.bookPage(bookId, cursor.nav.next);
    } catch {
      break; // continuation is best-effort; what we have is already verified
    }
    const nextMarkers = detectHadithMarkers(nextPage.paragraphs);
    // Paragraphs up to the first marker of a *different* number belong to us
    // (Muslim prints further routes of the same number as «٢ - (٨) …»).
    const other = nextMarkers.find((m) => m.number !== num);
    const cut = other ? other.paragraph : nextPage.paragraphs.length;
    if (cut === 0) break; // next page opens with a new hadith → nothing continues
    text += "\n" + nextPage.paragraphs.slice(0, cut).join("\n");
    chunks.push(nextPage);
    if (other) break;
    cursor = nextPage;
  }

  return {
    found: true,
    book_id: String(bookId),
    hadith_number: num,
    page,
    source: "shamela:/ajax/specialnumber2id + on-page marker",
    text,
    routes_on_page: hit.routes_on_page,
    spans_pages: chunks.map((c) => c.page_number),
    numbers_on_page: [...new Set(markers.map((m) => m.number))],
    // Per-page apparatus, so the caller can attribute editorial gradings
    // («[حكم الألباني] : …» lives in the footnotes of the page where they print it).
    pages: chunks.map((c) => ({
      page: c.page_number,
      footnotes: c.footnotes ?? [],
      paragraphs: c.paragraphs ?? [],
      numbers: detectHadithMarkers(c.paragraphs).map((m) => m.number),
    })),
    page_data: pageData,
  };
}

/**
 * Bounded tafsir resolution for an ayah that is NOT in the static ayah map.
 *
 * Uses the persisted `surahs[n] = {start, end}` page range (built offline by
 * scripts/build-tafsir-index.mjs from the book's TOC + in-text surah headings)
 * and searches inside it on the «﴿…(n)…﴾» ayah markers. Ayah numbers grow
 * roughly linearly with the page number inside a surah, so the search is an
 * interpolation search between two anchors (page, ayah) — falling back to the
 * midpoint whenever interpolation stops shrinking the interval — and a plain
 * forward walk once the interval is small enough to afford it. Already-indexed
 * neighbouring ayahs are used as anchors. Hard budget: `maxFetches` page
 * reads (default 20 — one Worker request stays far below the Cloudflare
 * subrequest cap). Never leaves the surah's range, never walks from the TOC.
 *
 * Results (always labelled):
 *   precision "exact"          the page whose bracket carries the ayah number
 *   precision "nearest_before" budget ran out, or the ayah is not printed in a
 *                              bracket of its own; page = the last page seen
 *                              whose markers are < ayah (the discussion is
 *                              *after* it — nav.next). `distance_hint` tells
 *                              the caller how wide the remaining window is.
 *   precision "surah_start"    no bracket markers anywhere in the pages read
 *                              (Ibn Kathir quotes al-Fatiha inline, never in
 *                              blocks) → the surah's first page
 *   found:false                book/surah not in the persisted index, or ayah
 *                              beyond the surah's length
 */
export async function resolveTafsirAyahBounded(client, bookId, surah, ayah, { maxFetches = 20, index: tIdx = tafsirIndex } = {}) {
  const id = String(bookId);
  const book = tIdx.books?.[id];
  if (!book || book.type !== "tafsir") return { found: false, reason: "no_tafsir_index_for_book", book_id: id, surah, ayah };
  const total = AYAH_COUNTS[surah] ?? 0;
  if (!total || ayah > total) return { found: false, reason: "ayah_out_of_range", book_id: id, surah, ayah, ayah_count: total || undefined };
  const range = tafsirSurahRange(id, surah, tIdx);
  if (!range) {
    return { found: false, reason: "surah_not_indexed", book_id: id, surah, ayah, surahs_indexed: Object.keys(book.surahs ?? {}).map(Number).sort((x, y) => x - y) };
  }

  const start = Number(range.start);
  const end = Number(range.end);
  // Anchors. lo: a page whose last marker < ayah (target is on lo.page or after).
  //          hi: a page whose first marker > ayah (target is strictly before hi.page).
  let lo = { page: start, ayah: 0, marks: null }; // virtual: the ayah cannot be before the surah start
  let hi = { page: end + 1, ayah: total + 1 }; // virtual
  for (const [key, entry] of Object.entries(book.ayahs ?? {})) {
    const [s, a] = key.split(":").map(Number);
    if (s !== surah) continue;
    const pg = Number(pageOf(entry));
    if (a < ayah && (pg > lo.page || (pg === lo.page && a > lo.ayah))) lo = { page: pg, ayah: a, marks: null };
    else if (a > ayah && (pg < hi.page || (pg === hi.page && a < hi.ayah))) hi = { page: pg + 1, ayah: a }; // the target may share that page's block
  }

  const fetched = new Map(); // page → marks
  let fetches = 0;
  let sawAnyMark = false;
  const budgetLeft = () => fetches < maxFetches;
  const read = async (page) => {
    if (fetched.has(page)) return fetched.get(page);
    fetches += 1;
    const pd = await client.bookPage(id, String(page));
    const marks = detectQuranBracketAyahs(pd.paragraphs, surah);
    fetched.set(page, marks);
    if (marks.length) sawAnyMark = true;
    return marks;
  };
  const done = (page, marks, precision, extra = {}) => ({
    found: true,
    book_id: id,
    surah,
    ayah,
    page: String(page),
    precision,
    source: "bounded_search",
    surah_range: { start: range.start, end: range.end },
    pages_fetched: fetches,
    ayahs_marked_on_page: marks ?? [],
    ...extra,
  });

  // Candidate window: [lo.page, hi.page - 1]. Pages in `fetched` that are
  // unmarked never need a second look.
  let first = lo.page; // first page not yet known to be unmarked/irrelevant
  let lastShrink = 1; // fraction of the window the previous step removed
  while (budgetLeft()) {
    const windowStart = Math.max(first, lo.page);
    const windowEnd = hi.page - 1;
    if (windowStart > windowEnd) break;
    const width = windowEnd - windowStart + 1;

    // Choose the probe.
    let est;
    if (width <= maxFetches - fetches) est = windowStart; // affordable: just walk forward
    else if (lastShrink < 0.25 || hi.ayah <= lo.ayah) est = Math.floor((windowStart + windowEnd) / 2);
    else {
      const frac = (ayah - lo.ayah) / (hi.ayah - lo.ayah);
      est = Math.round(lo.page + frac * (hi.page - lo.page));
      est = Math.min(Math.max(est, windowStart), windowEnd);
    }

    // Commentary pages carry no bracket, so spiral out from `est`
    // (est, est+1, est-1, est+2, …) until a marked page turns up; every page
    // visited on the way is known-unmarked, which tightens the window.
    let probe = est;
    let marks = await read(probe);
    let d = 0;
    let loVisited = est; // lowest visited page in this spiral
    let hiVisited = est; // highest visited page in this spiral
    while (!marks.length && budgetLeft()) {
      d += 1;
      const up = est + d;
      const down = est - d;
      if (up <= windowEnd) {
        probe = up;
        marks = await read(probe);
        hiVisited = up;
        if (marks.length) break;
      }
      if (down >= windowStart && budgetLeft()) {
        probe = down;
        marks = await read(probe);
        loVisited = down;
        if (marks.length) break;
      }
      if (up > windowEnd && down < windowStart) break; // whole window visited
    }
    if (!marks.length) {
      if (loVisited <= windowStart && hiVisited >= windowEnd) {
        // The whole window is unmarked → the ayah has no bracket of its own.
        if (lo.marks) return done(lo.page, lo.marks, "nearest_before", { note: gapNote(surah, ayah, lo.ayah, hi.ayah), distance_hint: 0 });
        hi = { page: windowStart, ayah: hi.ayah };
        continue;
      }
      break; // budget exhausted mid-spiral
    }
    if (marks.includes(ayah)) return done(probe, marks, "exact");
    const mFirst = marks[0];
    const mLast = marks[marks.length - 1];
    if (mLast < ayah) {
      const before = width;
      lo = { page: probe, ayah: mLast, marks };
      // everything visited above `probe` is unmarked
      first = Math.max(probe, hiVisited) + 1;
      lastShrink = 1 - (windowEnd - first + 1) / before;
    } else {
      // mFirst > ayah: the target's block ends before every unmarked page we
      // visited below `probe`, i.e. before min(loVisited, probe).
      const before = width;
      const newHi = Math.min(loVisited, probe);
      hi = { page: newHi, ayah: mFirst };
      lastShrink = 1 - (hi.page - 1 - windowStart + 1) / before;
      if (lo.marks && first >= hi.page) {
        // Nothing marked between lo's block and this one → the ayah has no bracket
        // of its own; its discussion is inside lo's block.
        return done(lo.page, lo.marks, "nearest_before", { note: gapNote(surah, ayah, lo.ayah, mFirst), distance_hint: 0 });
      }
    }
  }

  if (!sawAnyMark) {
    return done(start, [], "surah_start", {
      note: "এই সূরার পৃষ্ঠাগুলোতে ﴿…(n)…﴾ আয়াত-ব্লক নেই (ইবনে কাসীর ফাতিহা inline উদ্ধৃত করেন) — সূরার আলোচনার প্রথম পৃষ্ঠা দেওয়া হল; নির্দিষ্ট আয়াতের পৃষ্ঠা যাচাই করা যায়নি।",
    });
  }
  if (lo.marks) {
    const window = Math.max(0, hi.page - 1 - lo.page);
    return done(lo.page, lo.marks, "nearest_before", {
      note: `আয়াত ${surah}:${ayah}-এর ব্লক ${maxFetches} পৃষ্ঠা পড়ার সীমার মধ্যে পাওয়া যায়নি; এটি সর্বশেষ পৃষ্ঠা যেখানে এর আগের আয়াত (${lo.ayah}) চিহ্নিত — আলোচনা এর পরে, সর্বোচ্চ ${window} পৃষ্ঠার মধ্যে (nav.next)।`,
      distance_hint: window,
    });
  }
  return {
    found: false,
    reason: "ayah_not_located_within_budget",
    book_id: id,
    surah,
    ayah,
    surah_range: { start: range.start, end: range.end },
    pages_fetched: fetches,
  };
}

const gapNote = (surah, ayah, before, after) =>
  `আয়াত ${surah}:${ayah} আলাদা ﴿…﴾ ব্লকে চিহ্নিত নেই — এই পৃষ্ঠার ব্লক (…${before}) এবং পরবর্তী ব্লক (${after}…)-এর মাঝে; আলোচনা এই ব্লকের ভাষ্যের ভেতরে।`;

/**
 * Surah start pages from a tafsir book's TOC (offline builder helper — this is
 * what scripts/build-tafsir-index.mjs persists; never a request-time step).
 *
 * Returns Map surah → { page, heading, shared, source }. Headings that cover
 * several surahs («سورتي المعوذتين») give the same start to each; a surah
 * that later gets its own heading keeps the dedicated one.
 */
export function surahStartsFromToc(toc) {
  const starts = new Map();
  for (const t of toc ?? []) {
    const page = /\/book\/\d+\/(\d+)/.exec(t.href ?? "")?.[1];
    if (!page) continue;
    // Qurtubi 20855 nests «[سورة الفاتحة (١): آية ١]» under the basmala chapter
    // (p.97) BEFORE «تفسير سورة الفاتحة» (p.114): ayah headings never start a surah.
    if (isAyahHeading(t.title)) continue;
    const ss = surahsFromHeading(t.title);
    for (const s of ss) {
      const prev = starts.get(s);
      const shared = ss.length > 1;
      if (!prev || (prev.shared && !shared)) starts.set(s, { page, heading: t.title, shared, source: shared ? "toc_shared_heading" : "toc" });
    }
  }
  return starts;
}

/** Turn `starts` (surah → {page,heading,source}) + last page into `{ "<n>": {start,end,heading,source} }`. */
export function surahRangesFromStarts(starts, lastPage) {
  const ordered = [...starts.entries()].sort((a, b) => Number(a[1].page) - Number(b[1].page) || a[0] - b[0]);
  const out = {};
  ordered.forEach(([s, info], i) => {
    let end = Number(lastPage);
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (Number(ordered[j][1].page) > Number(info.page)) {
        end = Number(ordered[j][1].page) - 1;
        break;
      }
    }
    out[String(s)] = { start: String(info.page), end: String(end), heading: info.heading, source: info.source };
  });
  return out;
}
