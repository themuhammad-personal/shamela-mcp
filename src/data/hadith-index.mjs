/**
 * Seed data for citation-addressable retrieval (Roadmap Phase 2).
 *
 * This file is *generated/updated* by `scripts/build-hadith-index.mjs` (which
 * requires network access to shamela.ws). Until that job is run, `books` is
 * empty and every lookup returns `{ found: false, reason: ... }` — never a
 * fabricated number.
 *
 * Schema:
 *   books: {
 *     "<book_id>": {
 *       type: "hadith" | "tafsir",
 *       // hadith books:
 *       index:   { "<hadith_number>": { page: "<node_id>", note?: string } },
 *       reverse: { "<node_id>": ["<hadith_number>", ...] },
 *       // tafsir books:
 *       ayahs:   { "<surah>:<ayah>": { page: "<node_id>", note?: string } }
 *     }
 *   }
 */
export default {
  generated_at: null,
  books: {},
};
