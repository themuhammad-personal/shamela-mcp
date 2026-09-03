/**
 * Citation-addressable index resolver (Roadmap Phase 2 / Priorities 1, 2, 6).
 *
 * Reads a static, pre-built index (see src/data/hadith-index.mjs) so lookups
 * are O(1) map hits — no live TOC walk per request. The index is produced by
 * `scripts/build-hadith-index.mjs` ("scrape once, store, don't re-derive").
 *
 * Guardrail: when the index is empty or lacks an entry, we return
 * `{ found: false, reason: ... }` and NEVER invent a number/page.
 */

import index from "../data/hadith-index.mjs";

export function indexStatus(idx = index) {
  return {
    generated_at: idx.generated_at ?? null,
    books_indexed: Object.keys(idx.books ?? {}).length,
    books: idx.books ?? {},
  };
}

/**
 * Resolve a canonical hadith number → page/node in a given book edition.
 *
 * @param {string|number} bookId
 * @param {string|number} hadithNumber
 * @returns {{ found: true, book_id, hadith_number, page, note? } |
 *            { found: false, reason: string, hadith_number? }}
 */
export function resolveHadith(bookId, hadithNumber, idx = index) {
  const book = idx.books?.[String(bookId)];
  const num = String(hadithNumber);
  if (!book || book.type !== "hadith") {
    return { found: false, reason: "no_hadith_index_for_book", hadith_number: num };
  }
  const entry = book.index?.[num];
  if (!entry) return { found: false, reason: "hadith_number_not_indexed", hadith_number: num };
  return { found: true, book_id: String(bookId), hadith_number: num, page: entry.page, note: entry.note };
}

/**
 * Reverse lookup: which hadith number(s) fall on a given page/node.
 * Used so any page result can self-report its citation.
 */
export function hadithNumbersOnPage(bookId, page, idx = index) {
  const book = idx.books?.[String(bookId)];
  if (!book || book.type !== "hadith") return [];
  return book.reverse?.[String(page)] ?? [];
}

/**
 * Resolve a tafsir book + `surah:ayah` → the page/node discussing that ayah.
 */
export function resolveTafsirAyah(bookId, surah, ayah, idx = index) {
  const book = idx.books?.[String(bookId)];
  const key = `${surah}:${ayah}`;
  if (!book || book.type !== "tafsir") {
    return { found: false, reason: "no_tafsir_index_for_book", key };
  }
  const entry = book.ayahs?.[key];
  if (!entry) return { found: false, reason: "ayah_not_indexed", key };
  return { found: true, book_id: String(bookId), surah, ayah, page: entry.page, note: entry.note };
}
