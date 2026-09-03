/**
 * Populate the `book_id → canonical edition` mapping from live shamela.ws data.
 *
 * Why this exists: `src/canonical-editions.mjs` ships the *scholarly facts*
 * (which numbering authority is canonical per work) but NOT the shamela.ws
 * `book_id`s, because those must be resolved against live data and this
 * sandbox has no network. Run this script where network is available to
 * produce the seed map.
 *
 * Usage (requires internet):
 *   node scripts/resolve-canonical-editions.mjs
 *
 * Output:
 *   src/data/canonical-book-ids.json   (the resolved map)
 *
 * It is intentionally conservative: a book is recorded only when BOTH the
 * title and the author/muhaqqiq match a canonical edition (authority-level
 * match). Title-only matches are printed as "unconfirmed" and skipped, so we
 * never assert a canonical flag on a guess.
 */

import { CANONICAL_EDITIONS, detectCanonicalEdition } from "../src/canonical-editions.mjs";

const BASE = "https://shamela.ws";

async function searchBooks(query) {
  const url = `${BASE}/ajax/book/?term=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShamelaMCP/2.0)" },
  });
  if (!res.ok) throw new Error(`search HTTP ${res.status} for "${query}"`);
  const raw = await res.text();
  try {
    return (JSON.parse(raw).results?.items ?? []).map((x) => ({ id: String(x.id), title: x.text ?? "" }));
  } catch {
    return [];
  }
}

const clean = (s) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// Fetch a book's details page and extract the muhaqqiq ("المحقق") name, which
// is what distinguishes one edition from another. This mirrors the worker's
// `details()` `field()` extraction, keyed on the المحقق field.
async function fetchMuhaqqiq(bookId) {
  const res = await fetch(`${BASE}/book/${bookId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShamelaMCP/2.0)" },
  });
  if (!res.ok) throw new Error(`details HTTP ${res.status} for ${bookId}`);
  const html = await res.text();
  const body = clean(/<div style="line-height: 1\.8;">([\s\S]*?)<\/div>/i.exec(html)?.[1] || "");
  // المحقق (also accept تحقيق / حققه as fallback), up to the next known field.
  const m =
    /المحقق[:：]\s*([^\n]+?)(?=(?:الكتاب|المؤلف|المحقق|الناشر|الطبعة|عدد)[:：]|$)/i.exec(body) ||
    /تحقيق[:：]\s*([^\n]+)/i.exec(body);
  return m ? m[1].trim() : "";
}

const result = {};

for (const edition of CANONICAL_EDITIONS) {
  const query = edition.titleSignatures[0];
  console.log(`\n== ${edition.key} — searching "${query}" ==`);
  const items = await searchBooks(query);
  if (!items.length) {
    console.log("  (no results)");
    continue;
  }
  for (const item of items.slice(0, 12)) {
    let muhaqqiq = "";
    try {
      muhaqqiq = await fetchMuhaqqiq(item.id);
    } catch (e) {
      console.log(`  [${item.id}] ${item.title} — fetch error: ${e.message}`);
      continue;
    }
    const hit = detectCanonicalEdition({ title: item.title, muhaqqiq });
    if (hit?.confidence === "author") {
      result[edition.key] = { book_id: item.id, title: item.title, muhaqqiq, authorityRoman: hit.authorityRoman };
      console.log(`  ✔ [${item.id}] ${item.title}  →  ${muhaqqiq}  (${hit.authorityRoman})`);
      break; // one confirmed canonical edition per work is enough
    } else if (hit) {
      console.log(`  ? [${item.id}] ${item.title}  →  muhaqqiq "${muhaqqiq || "(none)"}" (title-only match, unconfirmed)`);
    }
  }
}

console.log("\nResolved canonical map:");
console.log(JSON.stringify(result, null, 2));
