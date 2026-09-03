/**
 * Populate the `book_id → canonical edition` mapping from live shamela.ws data.
 *
 * Why this exists: `src/canonical-editions.mjs` ships the *scholarly facts*
 * (which numbering authority is canonical per work) but NOT the shamela.ws
 * `book_id`s, because those must be resolved against live data.
 *
 * Usage (requires internet access to shamela.ws):
 *   npm run resolve:canonical
 *   node scripts/resolve-canonical-editions.mjs [--dry-run] [--limit 12]
 *
 * Output (THIS IS THE PART THAT ACTUALLY PERSISTS):
 *   src/data/canonical-book-ids.mjs   — imported by src/canonical-editions.mjs
 *
 * Commit that file (or let the `Refresh citation index` workflow do it) and the
 * `is_canonical_numbering` flag starts returning `confidence: "verified"`.
 *
 * It is intentionally conservative: a book is recorded only when BOTH the
 * title and the muhaqqiq match a canonical edition (authority-level match).
 * Title-only matches are printed as "unconfirmed" and skipped, so we never
 * assert a canonical flag on a guess. If NOTHING resolves we exit non-zero and
 * leave the existing file untouched — we never overwrite verified data with an
 * empty map.
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_EDITIONS, detectCanonicalEdition } from "../src/canonical-editions.mjs";
import { clean } from "../src/lib/arabic.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/canonical-book-ids.mjs");
const BASE = "https://shamela.ws";
const UA = "Mozilla/5.0 (compatible; ShamelaMCP/2.0)";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const CANDIDATE_LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 12;

/** Be polite to shamela.ws: it is a third-party site, not our own backend. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchBooks(query) {
  const url = `${BASE}/ajax/book/?term=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`search HTTP ${res.status} for "${query}"`);
  const raw = await res.text();
  try {
    return (JSON.parse(raw).results?.items ?? []).map((x) => ({ id: String(x.id), title: clean(x.text ?? "") }));
  } catch {
    return [];
  }
}

// Fetch a book's details page and extract the muhaqqiq ("المحقق") name, which
// is what distinguishes one edition from another. This mirrors the worker's
// `details()` `field()` extraction, keyed on the المحقق field.
async function fetchMuhaqqiq(bookId) {
  const res = await fetch(`${BASE}/book/${bookId}`, { headers: { "User-Agent": UA } });
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
const unconfirmed = [];
let errors = 0;

for (const edition of CANONICAL_EDITIONS) {
  const query = edition.titleSignatures[0];
  console.log(`\n== ${edition.key} — searching "${query}" ==`);
  let items = [];
  try {
    items = await searchBooks(query);
  } catch (e) {
    errors += 1;
    console.log(`  ! search failed: ${e.message}`);
    continue;
  }
  if (!items.length) {
    console.log("  (no results)");
    continue;
  }
  for (const item of items.slice(0, CANDIDATE_LIMIT)) {
    let muhaqqiq = "";
    try {
      muhaqqiq = await fetchMuhaqqiq(item.id);
    } catch (e) {
      errors += 1;
      console.log(`  [${item.id}] ${item.title} — fetch error: ${e.message}`);
      continue;
    }
    const hit = detectCanonicalEdition({ title: item.title, muhaqqiq });
    if (hit?.confidence === "author") {
      result[edition.key] = { book_id: item.id, title: item.title, muhaqqiq, authorityRoman: hit.authorityRoman };
      console.log(`  ✔ [${item.id}] ${item.title}  →  ${muhaqqiq}  (${hit.authorityRoman})`);
      break; // one confirmed canonical edition per work is enough
    } else if (hit) {
      unconfirmed.push({ key: edition.key, book_id: item.id, title: item.title, muhaqqiq });
      console.log(`  ? [${item.id}] ${item.title}  →  muhaqqiq "${muhaqqiq || "(none)"}" (title-only match, unconfirmed)`);
    }
    await sleep(250);
  }
}

const resolvedCount = Object.keys(result).length;
console.log(`\nResolved ${resolvedCount}/${CANONICAL_EDITIONS.length} canonical editions (${errors} request errors, ${unconfirmed.length} unconfirmed).`);
console.log(JSON.stringify(result, null, 2));

if (!resolvedCount) {
  // Never clobber verified data with an empty map: a network blip in CI must
  // not silently strip canonical flags from a working deployment.
  console.error("\n✖ Nothing resolved — leaving the existing map untouched.");
  console.error("  Most likely cause: no network access to shamela.ws, or upstream blocked us.");
  process.exit(1);
}

const file = `/**
 * GENERATED by scripts/resolve-canonical-editions.mjs — do not hand-edit.
 *
 * Verified against ${BASE} on the date below. Only authority-level matches
 * (title + muhaqqiq) are recorded here; see the script header for why
 * title-only matches are excluded.
 */
export default ${JSON.stringify(
    { generated_at: new Date().toISOString(), source: BASE, editions: result },
    null,
    2,
  )};
`;

if (DRY_RUN) {
  console.log(`\n--dry-run: would write ${OUT_PATH} (${file.length} bytes)`);
  if (existsSync(OUT_PATH)) console.log(`current file is ${readFileSync(OUT_PATH, "utf8").length} bytes`);
} else {
  writeFileSync(OUT_PATH, file);
  console.log(`\n✔ Wrote ${OUT_PATH}`);
  console.log("  Commit this file (the CI workflow does it automatically).");
}
