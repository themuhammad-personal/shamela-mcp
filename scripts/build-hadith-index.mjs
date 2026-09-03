/**
 * Build the citation-addressable index (Roadmap Phase 2) from live shamela.ws
 * data. Run where network is available:
 *
 *   npm run build:index
 *   node scripts/build-hadith-index.mjs [--book <id>:<hadith|tafsir>] [--limit 400] [--dry-run] [--force]
 *
 * Which books get indexed:
 *   1. every edition in `src/data/canonical-book-ids.mjs` (the ones the
 *      resolver confirmed at authority level), plus
 *   2. anything you pass with --book (repeatable), e.g. --book 169:tafsir
 *   If that set is empty the script EXITS NON-ZERO and writes nothing — it must
 *   never overwrite a good index with an empty one.
 *
 * Output: rewrites `src/data/hadith-index.mjs` with a forward index
 * (`hadith_number → page`) and reverse index (`page → [numbers]`) per hadith
 * book, plus a `surah:ayah → page` map per tafsir book. Books already in the
 * index that this run did not touch are preserved (merge, not replace).
 *
 * HONEST LIMITATIONS (do not paper over these):
 *   - shamela.ws does NOT mark hadith numbers uniformly. Detection lives in
 *     `src/lib/citation-detect.mjs` and is best-effort; where nothing is
 *     marked the entry is omitted, never guessed.
 *   - Tafsir ayah mapping requires an explicit "سورة <name>: <n>" and records
 *     the first page that states it; a mufassir may discuss an ayah elsewhere.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { detectHadithNumbers, detectAyahs } from "../src/lib/citation-detect.mjs";
import existingIndex from "../src/data/hadith-index.mjs";
import canonicalBookIds from "../src/data/canonical-book-ids.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/hadith-index.mjs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const opt = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const PAGE_LIMIT = opt("limit", 400);
const DELAY_MS = opt("delay", 200);

/** Be polite to shamela.ws: it is a third-party site, not our own backend. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function targetBooks() {
  const books = {};
  for (const [key, rec] of Object.entries(canonicalBookIds?.editions ?? {})) {
    if (!rec?.book_id) continue;
    books[String(rec.book_id)] = { type: "hadith", key, note: rec.authorityRoman };
  }
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--book") continue;
    const raw = String(args[i + 1] ?? "");
    const [id, type = "hadith"] = raw.split(":");
    if (!/^\d+$/.test(id) || (type !== "hadith" && type !== "tafsir")) {
      console.error(`✖ --book expects <book_id>:<hadith|tafsir>, got "${raw}"`);
      process.exit(1);
    }
    books[id] = { type, ...(books[id] || {}) };
  }
  return books;
}

const BOOKS = targetBooks();
if (!Object.keys(BOOKS).length) {
  console.error("✖ Nothing to index.");
  console.error("  src/data/canonical-book-ids.mjs is empty and no --book was given.");
  console.error("  Run `npm run resolve:canonical` first (needs network to shamela.ws),");
  console.error("  or pass an explicit target, e.g. --book 169:tafsir");
  process.exit(1);
}

const http = createHttp();
const client = createClient({ text: http.text });

// Merge into whatever already exists so a partial run never destroys data for
// books it did not touch.
const index = { generated_at: new Date().toISOString(), books: { ...(existingIndex?.books ?? {}) } };
let newEntries = 0;
let skipped = 0;

for (const [bookId, cfg] of Object.entries(BOOKS)) {
  console.log(`\n== indexing ${bookId} (${cfg.type}${cfg.key ? `, ${cfg.key}` : ""}) ==`);
  let d;
  try {
    d = await client.details(bookId);
  } catch (e) {
    skipped += 1;
    console.error(`  ! details failed: ${e.message} — skipping (any existing entry is kept)`);
    continue;
  }
  const nodes = [...new Set(d.toc.map((t) => /\/book\/\d+\/(\d+)/.exec(t.href)?.[1]).filter(Boolean))].slice(0, PAGE_LIMIT);
  console.log(`  ${nodes.length} page node(s) in TOC (cap ${PAGE_LIMIT})`);

  if (cfg.type === "hadith") {
    const forward = {};
    const reverse = {};
    let unmarked = 0;
    for (const page of nodes) {
      let content = "";
      try {
        ({ content } = await client.bookPage(bookId, page));
      } catch (e) {
        console.error(`  ! page ${page} failed: ${e.message}`);
        continue;
      }
      const nums = detectHadithNumbers(content);
      if (!nums.length) unmarked += 1;
      for (const num of nums) {
        (forward[num] ||= { page, note: cfg.note });
        (reverse[page] ||= []).push(num);
      }
      await sleep(DELAY_MS);
    }
    const count = Object.keys(forward).length;
    newEntries += count;
    index.books[bookId] = { type: "hadith", ...(cfg.key ? { key: cfg.key } : {}), index: forward, reverse };
    console.log(`  hadith: ${count} numbered on ${nodes.length - unmarked}/${nodes.length} pages (${unmarked} unmarked → omitted, not guessed)`);
  } else {
    const ayahs = {};
    let unmarked = 0;
    for (const page of nodes) {
      let content = "";
      try {
        ({ content } = await client.bookPage(bookId, page));
      } catch (e) {
        console.error(`  ! page ${page} failed: ${e.message}`);
        continue;
      }
      const refs = detectAyahs(content);
      if (!refs.length) unmarked += 1;
      for (const ref of refs) (ayahs[ref] ||= { page, note: cfg.note });
      await sleep(DELAY_MS);
    }
    const count = Object.keys(ayahs).length;
    newEntries += count;
    index.books[bookId] = { type: "tafsir", ...(cfg.key ? { key: cfg.key } : {}), ayahs };
    console.log(`  tafsir: ${count} ayah refs on ${nodes.length - unmarked}/${nodes.length} pages`);
  }
}

const totalEntries = Object.values(index.books).reduce((n, b) => n + Object.keys(b.index ?? b.ayahs ?? {}).length, 0);
console.log(`\nIndex now holds ${Object.keys(index.books).length} book(s), ${totalEntries} citation entries (${newEntries} new this run, ${skipped} book(s) skipped).`);

if (!newEntries && !FORCE) {
  console.error("\n✖ This run produced zero new entries — the existing index was NOT overwritten.");
  console.error("  Usually means no markers were found in these editions; tune");
  console.error("  src/lib/citation-detect.mjs, or re-run with --force if intended.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`\n--dry-run: would write ${OUT_PATH}${existsSync(OUT_PATH) ? ` (currently ${readFileSync(OUT_PATH, "utf8").length} bytes)` : ""}`);
  process.exit(0);
}

writeFileSync(
  OUT_PATH,
  `/**\n * GENERATED by scripts/build-hadith-index.mjs — do not hand-edit.\n * Re-run: npm run build:index\n */\nexport default ${JSON.stringify(index, null, 2)};\n`,
);
console.log(`\n✔ Wrote ${OUT_PATH}`);
console.log("  Commit this file (the 'Refresh citation index' workflow does it automatically).");
