/**
 * Citation-addressable resolution (Roadmap Phase 2).
 *
 * Two layers, both of which refuse to guess:
 *
 *  1. STATIC INDEX  (`src/data/hadith-index.mjs`, built by
 *     `scripts/build-hadith-index.mjs`): O(1) `hadith_number → page` and
 *     `page → [numbers]` maps, plus `surah:ayah → page` for tafsir.
 *
 *  2. LIVE LOOKUP  (`resolveHadithLive`): shamela's own
 *     `GET /ajax/specialnumber2id/<book>/<n>` — the endpoint behind the
 *     "رقم الحديث / الرقم المسلسل" box on every hadith page — followed by a
 *     fetch of that page and a check that the marker «n - …» really is on it.
 *     shamela returns the *last* page for out-of-range numbers, so the on-page
 *     check is not optional.
 *
 * `{ found: false, reason }` is the answer whenever either layer cannot prove
 * the number; never a fabricated page.
 */

import index from "../data/hadith-index.mjs";
import { detectHadithMarkers, extractHadith, surahFromHeading, detectQuranBracketAyahs, detectAyahs } from "./citation-detect.mjs";
import { canonicalRecord } from "../canonical-editions.mjs";

export function indexStatus(idx = index) {
  const books = idx.books ?? {};
  const ids = Object.keys(books);
  let hadith_books = 0;
  let tafsir_books = 0;
  let hadith_entries = 0;
  let ayah_entries = 0;
  for (const b of Object.values(books)) {
    if (b?.type === "hadith") {
      hadith_books += 1;
      hadith_entries += Object.keys(b.index ?? {}).length;
    } else if (b?.type === "tafsir") {
      tafsir_books += 1;
      ayah_entries += Object.keys(b.ayahs ?? {}).length;
    }
  }
  return {
    generated_at: idx.generated_at ?? null,
    books_indexed: ids.length,
    indexed_book_ids: ids,
    hadith_books,
    tafsir_books,
    hadith_entries,
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

/** Static-index tafsir lookup only (synchronous). */
export function resolveTafsirAyah(bookId, surah, ayah, idx = index) {
  const book = idx.books?.[String(bookId)];
  const key = `${surah}:${ayah}`;
  if (!book || book.type !== "tafsir") {
    return { found: false, reason: "no_tafsir_index_for_book", key };
  }
  const entry = book.ayahs?.[key];
  if (!entry) return { found: false, reason: "ayah_not_indexed", key };
  return { found: true, book_id: String(bookId), surah, ayah, page: entry.page, note: entry.note, source: "static_index" };
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
    page_data: pageData,
  };
}

/**
 * Live tafsir resolution without a prebuilt index:
 *   1. find the surah's chapter in the book TOC («تفسير سورة X»),
 *   2. walk pages from there while «﴿…(n)…﴾» markers are below the target,
 *   3. stop at the first page whose bracket markers reach `ayah`.
 * Bounded by `maxPages`; returns found:false if the surah has no TOC entry or
 * the walk exceeds the bound (never a guessed page).
 */
export async function resolveTafsirAyahLive(client, bookId, surah, ayah, { maxPages = 60 } = {}) {
  const d = await client.details(bookId);
  const entries = d.toc
    .map((t) => ({ surah: surahFromHeading(t.title), page: /\/book\/\d+\/(\d+)/.exec(t.href)?.[1] }))
    .filter((e) => e.surah && e.page);
  const start = entries.find((e) => e.surah === surah);
  if (!start) return { found: false, reason: "surah_not_in_toc", surah, ayah, surahs_in_toc: [...new Set(entries.map((e) => e.surah))] };
  const nextSurahStart = entries.filter((e) => e.surah !== surah && Number(e.page) > Number(start.page)).sort((a, b) => a.page - b.page)[0];

  let page = start.page;
  let visited = 0;
  let lastSeen = 0;
  while (page && visited < maxPages) {
    if (nextSurahStart && Number(page) >= Number(nextSurahStart.page)) break;
    const pd = await client.bookPage(bookId, page);
    const marks = detectQuranBracketAyahs(pd.paragraphs, surah);
    const key = `${surah}:${ayah}`;
    const explicit = detectAyahs(pd.paragraphs).includes(key);
    if (marks.includes(ayah) || (marks.length && marks[0] > ayah && lastSeen && lastSeen < ayah)) {
      // Either the ayah is quoted here, or it fell between the previous page's
      // last marker and this page's first — the discussion started earlier.
      const resolvedPage = marks.includes(ayah) ? page : pd.nav?.prev ?? page;
      return { found: true, book_id: String(bookId), surah, ayah, page: resolvedPage, source: "live_toc_walk", ayahs_marked_on_page: marks, explicit_reference: explicit };
    }
    if (marks.length) lastSeen = marks[marks.length - 1];
    if (lastSeen >= ayah) break;
    page = pd.nav?.next ?? null;
    visited += 1;
  }
  return { found: false, reason: "ayah_not_located_within_bound", surah, ayah, pages_walked: visited, started_at_page: start.page };
}
