/**
 * Canonical-edition metadata for high-traffic reference works.
 *
 * Purpose (Roadmap Phase 1.1 / Priority 3):
 *   shamela.ws indexes several editions of the same classical work (e.g. five
 *   editions of Sahih al-Bukhari). Only ONE of them uses the globally-standard
 *   hadith numbering that scholars cite worldwide (the numbering printed in
 *   Bangla/Urdu/English translations). This module tells the caller which one
 *   that is, via an `is_canonical_numbering` flag, so the model never guesses.
 *
 * IMPORTANT — accuracy discipline:
 *   - The numbering authorities below are well-established scholarly facts
 *     (e.g. Fuad Abd al-Baqi's numbering for Bukhari/Muslim is what the
 *     worldwide translations follow). They are NOT inferred at runtime.
 *   - Exact shamela.ws `book_id`s and exact title strings are **pending live
 *     verification** (this sandbox cannot reach shamela.ws). Resolve them with
 *     `scripts/resolve-canonical-editions.mjs` once you have network access.
 *   - We never *invent* grading or numbers; a non-match simply returns false.
 */

/**
 * Canonical hadith collections and the numbering authority whose edition is
 * the worldwide citation standard.
 *
 * `key`            stable slug
 * `titleSignatures` normalized-Arabic title fragments that identify the work
 * `authorities`     normalized-Arabic name fragments of the muhaqqiq/numbering
 *                   authority whose edition uses the standard numbering
 * `authorityRoman`  Latin rendering, for humans/tool descriptions
 * `note`            short provenance note
 */
export const CANONICAL_EDITIONS = [
  {
    key: "sahih-al-bukhari",
    titleSignatures: ["صحيح البخاري", "الجامع الصحيح", "صحيح البخاري المسند"],
    authorities: ["محمد فؤاد عبد الباقي", "فؤاد عبد الباقي"],
    authorityRoman: "Muhammad Fuad Abd al-Baqi",
    note: "Fuad Abd al-Baqi numbering is the standard cited in worldwide translations (e.g. Muhsin Khan / Bangla / Urdu prints).",
  },
  {
    key: "sahih-muslim",
    titleSignatures: ["صحيح مسلم", "المسند الصحيح"],
    authorities: ["محمد فؤاد عبد الباقي", "فؤاد عبد الباقي"],
    authorityRoman: "Muhammad Fuad Abd al-Baqi",
    note: "Fuad Abd al-Baqi numbering is the standard for Sahih Muslim.",
  },
  {
    key: "jami-at-tirmidhi",
    titleSignatures: ["جامع الترمذي", "سنن الترمذي", "الجامع المختصر"],
    authorities: ["أحمد محمد شاكر", "احمد شاكر"],
    authorityRoman: "Ahmad Muhammad Shakir",
    note: "Ahmad Shakir's tahqiq + numbering is the standard for Tirmidhi.",
  },
  {
    key: "sunan-abu-dawud",
    titleSignatures: ["سنن أبي داود", "سنن ابي داود"],
    authorities: ["محمد محيي الدين عبد الحميد", "محيي الدين عبد الحميد"],
    authorityRoman: "Muhammad Muhyi al-Din Abd al-Hamid",
    note: "Muhyi al-Din Abd al-Hamid's numbering is the standard for Abu Dawud.",
  },
  {
    key: "sunan-an-nasai",
    titleSignatures: ["سنن النسائي", "المجتبى", "السنن الصغرى"],
    authorities: ["عبد الفتاح أبو غدة", "عبد الفتاح ابو غدة", "ابو غدة", "أبو غدة"],
    authorityRoman: "Abd al-Fattah Abu Ghuddah",
    note: "Abu Ghuddah's numbering is the standard for Sunan al-Nasa'i (al-Mujtaba).",
  },
  {
    key: "sunan-ibn-majah",
    titleSignatures: ["سنن ابن ماجه"],
    authorities: ["محمد فؤاد عبد الباقي", "فؤاد عبد الباقي"],
    authorityRoman: "Muhammad Fuad Abd al-Baqi",
    note: "Fuad Abd al-Baqi numbering is the standard for Ibn Majah.",
  },
  {
    key: "musnad-ahmad",
    titleSignatures: ["مسند الإمام أحمد", "مسند الامام احمد", "مسند أحمد بن حنبل"],
    authorities: ["أحمد محمد شاكر", "احمد شاكر"],
    authorityRoman: "Ahmad Muhammad Shakir",
    note: "Ahmad Shakir's numbered edition is the standard for Musnad Ahmad.",
  },
  {
    key: "muwatta-malik",
    titleSignatures: ["موطأ مالك", "الموطأ"],
    authorities: ["محمد فؤاد عبد الباقي", "فؤاد عبد الباقي"],
    authorityRoman: "Muhammad Fuad Abd al-Baqi",
    note: "Fuad Abd al-Baqi's two-volume Muwatta is a common citation standard.",
  },
];

/**
 * Arabic normalization matching the worker's own `normalizeArabic`:
 * strip harakat/tatweel, fold hamza forms, ya/alef-maqsura/ta-marbuta, collapse
 * whitespace, lowercase. Kept self-contained so this module is unit-testable
 * without the deployed bundle.
 */
export function normalizeArabic(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includes(a, b) {
  return a.length > 0 && b.length > 0 && a.includes(b);
}

/**
 * Decide whether a book record corresponds to a canonical (standard-numbering)
 * edition.
 *
 * @param {{title?: string, muhaqqiq?: string, author?: string, book_id?: string}} book
 *   - `title`    book title (Arabic), e.g. from search results or book details
 *   - `muhaqqiq` the *tahqiq/numbering authority* name (shamela's "المحقق"
 *                field). This is what distinguishes editions — NOT the original
 *                author (on shamela, "author" is usually the original author,
 *                e.g. al-Bukhari, who is the same across editions).
 *   - `author`   accepted as a fallback for `muhaqqiq` when callers only have
 *                the author link (may be the original author — weaker signal).
 * @returns {null | {key, authorityRoman, note, confidence: "author" | "title"}}
 *
 * Matching discipline (three cases):
 *   1. Title matches AND muhaqqiq matches the canonical authority
 *      → `confidence: "author"` (strong; assert canonical = true).
 *   2. Title matches but muhaqqiq is KNOWN and is a DIFFERENT person
 *      → `null` (this is a non-canonical edition of the same work).
 *   3. Title matches but muhaqqiq is unknown/empty
 *      → `confidence: "title"` (weak; callers must NOT assert canonical on it).
 */
export function detectCanonicalEdition(book = {}) {
  const title = normalizeArabic(book.title);
  const muhaqqiq = normalizeArabic(book.muhaqqiq ?? book.author ?? "");
  if (!title) return null;

  for (const edition of CANONICAL_EDITIONS) {
    const titleHit = edition.titleSignatures.some((sig) => includes(title, normalizeArabic(sig)));
    if (!titleHit) continue;

    if (muhaqqiq) {
      const authorityHit = edition.authorities.some((a) => includes(muhaqqiq, normalizeArabic(a)));
      if (authorityHit) {
        return {
          key: edition.key,
          authorityRoman: edition.authorityRoman,
          note: edition.note,
          confidence: "author",
        };
      }
      // Same work, different muhaqqiq → a non-canonical edition.
      return null;
    }
    // No muhaqqiq info available: title-only, weak.
    return {
      key: edition.key,
      authorityRoman: edition.authorityRoman,
      note: edition.note,
      confidence: "title",
    };
  }
  return null;
}

/**
 * Convenience: boolean canonical flag for a book record.
 * Returns true only on an authority-level match; title-only matches are
 * reported as `false` (unconfirmed) unless `allowTitleOnly` is set.
 */
export function isCanonicalNumbering(book = {}, { allowTitleOnly = false } = {}) {
  const hit = detectCanonicalEdition(book);
  if (!hit) return false;
  if (hit.confidence === "author") return true;
  return allowTitleOnly;
}

/**
 * Resolved book_id → canonical mapping, populated by
 * `scripts/resolve-canonical-editions.mjs` (needs network). Kept separate from
 * the signature detector so `search_books_by_name` (which lacks author info)
 * can answer instantly from a precomputed map instead of per-book fetches.
 *
 * Seed is intentionally empty until live verification.
 */
export const CANONICAL_BOOK_IDS = new Map();

/**
 * Produce the canonical annotation to attach to a book result.
 *
 * Precedence:
 *   1. `CANONICAL_BOOK_IDS` (precomputed book_id → canonical) → authoritative
 *      (`confidence: "verified"`), `is_canonical_numbering: true`.
 *   2. muhaqqiq-level detection → `confidence: "author"`, true.
 *   3. title-only detection (no muhaqqiq known) → `confidence: "title"`,
 *      `is_canonical_numbering: false` (never assert canonical on a guess).
 *   4. no match (or a *different* muhaqqiq) → `canonical_edition: null`, false.
 *
 * @returns {{ is_canonical_numbering: boolean, canonical_edition: object | null }}
 */
export function canonicalFields(book = {}) {
  if (book.book_id != null && CANONICAL_BOOK_IDS.has(String(book.book_id))) {
    const byId = CANONICAL_BOOK_IDS.get(String(book.book_id));
    return {
      is_canonical_numbering: true,
      canonical_edition: { ...byId, confidence: "verified" },
    };
  }
  const hit = detectCanonicalEdition(book);
  if (!hit) return { is_canonical_numbering: false, canonical_edition: null };
  if (hit.confidence === "author") {
    return { is_canonical_numbering: true, canonical_edition: hit };
  }
  return { is_canonical_numbering: false, canonical_edition: hit };
}
