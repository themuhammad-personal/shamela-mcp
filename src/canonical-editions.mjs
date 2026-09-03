/**
 * Canonical-edition lookup for high-traffic reference works.
 *
 * shamela.ws hosts several editions of each classical collection (five of
 * Sahih al-Bukhari alone). Only one per work carries the hadith numbering that
 * translations and takhrij cite worldwide. This module answers "is this
 * book_id that edition?" — from a HAND-VERIFIED whitelist, never a guess.
 *
 * Why a whitelist and not heuristics:
 *   The earlier approach matched the محقق name against the numbering
 *   authority. On real data that is WRONG in both directions:
 *     - 1681 (Bukhari ط السلطانية) is muhaqqiq'd by محمد زهير الناصر but uses
 *       Abd al-Baqi's numbering → false negative.
 *     - شرح/مختصر titles that mention the same محقق → false positive.
 *   `src/data/canonical-book-ids.mjs` documents how each id was verified.
 *
 * Title-based detection is retained ONLY to say "this looks like the same
 * work; the canonical edition is book_id X" — it never asserts canonical.
 */

import { normalizeArabic } from "./lib/arabic.mjs";
import canonicalBookIds from "./data/canonical-book-ids.mjs";

export { normalizeArabic };

/** Normalized title fragments that identify a *work* (not an edition). */
const WORK_SIGNATURES = {
  "sahih-al-bukhari": ["صحيح البخاري", "الجامع المسند الصحيح"],
  "sahih-muslim": ["صحيح مسلم", "المسند الصحيح المختصر"],
  "sunan-abi-dawud": ["سنن ابي داود", "سنن أبي داود"],
  "jami-at-tirmidhi": ["سنن الترمذي", "جامع الترمذي", "الجامع الكبير"],
  "sunan-an-nasai": ["سنن النسائي", "المجتبي من السنن", "السنن الصغري"],
  "sunan-ibn-majah": ["سنن ابن ماجه", "سنن ابن ماجة"],
  "muwatta-malik": ["موطا مالك", "الموطا"],
  "musnad-ahmad": ["مسند احمد", "مسند الامام احمد"],
  "tafsir-ibn-kathir": ["تفسير ابن كثير", "تفسير القران العظيم"],
};

/** Words that mark a derivative work (commentary, abridgement, grading…). */
const DERIVATIVE = /(^|\s)(شرح|حاشي[ةه]|مختصر|تهذيب|صحيح وضعيف|ضعيف|زوائد|اطراف|أطراف|فتح|عون|تحف[ةه]|منح[ةه]|عمد[ةه]|ارشاد|إرشاد|كوثر|فيض|مرقا[ةه]|ذخير[ةه]|تعليق|تخريج|فهرس|اسانيد|أسانيد|رجال|مسند الشاميين)(\s|$)/;

const EDITIONS = canonicalBookIds?.editions ?? {};

/** Edition key → full record (with key), for iteration. */
export const CANONICAL_EDITIONS = Object.entries(EDITIONS).map(([key, rec]) => ({ key, ...rec }));

/**
 * book_id → canonical record. Only ids verified in the data file are here.
 * Exported as a Map (same shape the tools/tests already consume).
 */
export const CANONICAL_BOOK_IDS = new Map(
  CANONICAL_EDITIONS.map((rec) => [String(rec.book_id), rec]),
);

/** book_id → { key, canonical_book_id, note } for every *known non-canonical* edition. */
export const OTHER_EDITION_IDS = new Map(
  CANONICAL_EDITIONS.flatMap((rec) =>
    (rec.other_editions ?? []).map((o) => [
      String(o.book_id),
      { key: rec.key, canonical_book_id: String(rec.book_id), canonical_title: rec.title, title: o.title, note: o.note },
    ]),
  ),
);

/** Provenance of the whitelist — surfaced in tool output. */
export function canonicalMapStatus() {
  return {
    resolved_at: canonicalBookIds?.generated_at ?? null,
    source: canonicalBookIds?.source ?? null,
    verified_book_ids: CANONICAL_BOOK_IDS.size,
    known_other_editions: OTHER_EDITION_IDS.size,
  };
}

/**
 * Which *work* does this title belong to (if any)? Title-only, so it can only
 * ever say "same work" — never "canonical edition".
 *
 * @returns {null | { key, canonical_book_id, canonical_title, derivative: boolean }}
 */
export function detectWork(title) {
  const t = normalizeArabic(title);
  if (!t) return null;
  for (const [key, sigs] of Object.entries(WORK_SIGNATURES)) {
    if (!sigs.some((s) => t.includes(normalizeArabic(s)))) continue;
    const rec = EDITIONS[key];
    return {
      key,
      canonical_book_id: rec ? String(rec.book_id) : null,
      canonical_title: rec?.title ?? null,
      derivative: DERIVATIVE.test(t),
    };
  }
  return null;
}

/**
 * Backwards-compatible detector. Returns:
 *   - `{ confidence: "verified", ... }` when book_id is on the whitelist
 *   - `{ confidence: "other_edition", ... }` when book_id is a known non-canonical edition
 *   - `{ confidence: "title", ... }` when only the title suggests the work
 *   - `null` otherwise
 * Never "author": the محقق name is not evidence of numbering (see header).
 */
export function detectCanonicalEdition(book = {}) {
  const id = book.book_id != null ? String(book.book_id) : "";
  if (id && CANONICAL_BOOK_IDS.has(id)) {
    const rec = CANONICAL_BOOK_IDS.get(id);
    return { key: rec.key, authorityRoman: rec.numbering_roman, note: rec.note, confidence: "verified" };
  }
  if (id && OTHER_EDITION_IDS.has(id)) {
    const o = OTHER_EDITION_IDS.get(id);
    return {
      key: o.key,
      authorityRoman: EDITIONS[o.key]?.numbering_roman ?? null,
      note: o.note,
      confidence: "other_edition",
      canonical_book_id: o.canonical_book_id,
      canonical_title: o.canonical_title,
    };
  }
  const work = detectWork(book.title);
  if (!work) return null;
  return {
    key: work.key,
    authorityRoman: EDITIONS[work.key]?.numbering_roman ?? null,
    note: work.derivative
      ? "শিরোনাম বলছে এটি মূল গ্রন্থের শرح/মুখতাসার/ডেরিভেটিভ — canonical নয়।"
      : "শুধু শিরোনাম মিলেছে; এই সংস্করণের ক্রমসংখ্যা যাচাই করা হয়নি।",
    confidence: "title",
    canonical_book_id: work.canonical_book_id,
    canonical_title: work.canonical_title,
    derivative: work.derivative,
  };
}

/** True only for whitelisted ids. `allowTitleOnly` kept for API compatibility but is ignored on purpose. */
export function isCanonicalNumbering(book = {}) {
  return detectCanonicalEdition(book)?.confidence === "verified";
}

/**
 * Annotation attached to every book result.
 *
 * @returns {{ is_canonical_numbering: boolean, canonical_edition: object | null }}
 *   `canonical_edition.confidence` ∈ verified | other_edition | title.
 *   When it is not `verified`, `canonical_book_id` tells the caller which
 *   book_id to use instead for hadith-number lookups.
 */
export function canonicalFields(book = {}) {
  const hit = detectCanonicalEdition(book);
  if (!hit) return { is_canonical_numbering: false, canonical_edition: null };
  return { is_canonical_numbering: hit.confidence === "verified", canonical_edition: hit };
}

/** Full record for a whitelisted id (or null). Used by the hadith resolver for bounds/notes. */
export function canonicalRecord(bookId) {
  return CANONICAL_BOOK_IDS.get(String(bookId)) ?? null;
}
