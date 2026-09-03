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
 *       type: "hadith",
 *       index:   { "<hadith_number>": { page: "<node_id>", verified: boolean, note?: string } },
 *       reverse: { "<node_id>": ["<hadith_number>", ...] }
 *     }
 *   }
 *
 * Tafsir books live in `src/data/tafsir-index.mjs` (scripts/build-tafsir-index.mjs).
 */
export default {
  generated_at: null,
  books: {},
};
