/**
 * Build the citation-addressable index (Roadmap Phase 2) from live shamela.ws.
 *
 *   npm run build:index
 *   node scripts/build-hadith-index.mjs [--book <id>] [--from=1] [--to=N] [--step=1]
 *                                       [--delay=250] [--dry-run] [--force]
 *
 *   (Tafsir books have their own index and builder: scripts/build-tafsir-index.mjs
 *    → src/data/tafsir-index.mjs. `--tafsir` here just forwards you there.)
 *
 * HOW (hadith books):
 *   For every hadith number n in [from, to] ask shamela's own lookup
 *   `GET /ajax/specialnumber2id/<book>/<n>` → page id. That is exactly what the
 *   "رقم الحديث / الرقم المسلسل" box on shamela does, so the mapping is
 *   authoritative, not heuristic. We then fetch each *distinct* page once and
 *   record which numbers are printed on it («n - …» at paragraph start) so the
 *   reverse map only contains numbers actually verified on the page.
 *
 *   Cost: one tiny AJAX call per number + one page fetch per distinct page
 *   (~7.5k + ~11k requests for Bukhari). Default delay 250 ms → ~1.5 h/book.
 *   Use --step to sample (e.g. --step=50 for a smoke run) and --from/--to to
 *   resume; existing entries are merged, never dropped.
 *
 * Which books: whitelisted canonical hadith ids in src/data/canonical-book-ids.mjs
 * unless --book narrows it.
 *
 * Output: src/data/hadith-index.mjs (merge). Never overwrites with an empty
 * result unless --force.
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { detectHadithMarkers } from "../src/lib/citation-detect.mjs";
import existingIndex from "../src/data/hadith-index.mjs";
import canonicalBookIds from "../src/data/canonical-book-ids.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/hadith-index.mjs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const rawOpt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numberOpt = (name, fallback, min) => {
  const raw = rawOpt(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    console.error(`✖ --${name} must be a safe integer >= ${min}`);
    process.exit(1);
  }
  return value;
};
const FROM = numberOpt("from", 1, 1);
const TO = numberOpt("to", 0, 0); // 0 → edition's last_number
const STEP = numberOpt("step", 1, 1);
const DELAY_MS = numberOpt("delay", 250, 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (flag) => args.flatMap((a, i) => (a === flag && /^\d+$/.test(args[i + 1] ?? "") ? [args[i + 1]] : []));

const editions = Object.entries(canonicalBookIds?.editions ?? {}).map(([key, rec]) => ({ key, ...rec }));
const explicitBooks = list("--book");
if (args.includes("--tafsir")) {
  console.error("✖ Tafsir books are indexed by scripts/build-tafsir-index.mjs (npm run build:tafsir -- --tafsir <id>).");
  process.exit(1);
}

const hadithTargets = editions
  .filter((e) => e.type === "hadith")
  .filter((e) => (explicitBooks.length ? explicitBooks.includes(String(e.book_id)) : true))
  .concat(explicitBooks.filter((id) => !editions.some((e) => String(e.book_id) === id)).map((id) => ({ key: null, book_id: id, type: "hadith" })));

if (!hadithTargets.length) {
  console.error("✖ Nothing to index. Pass --book <id>, or populate src/data/canonical-book-ids.mjs.");
  process.exit(1);
}

const http = createHttp({ ttl: 0 });
const client = createClient({ text: http.text });
const index = { generated_at: new Date().toISOString(), books: { ...(existingIndex?.books ?? {}) } };
let newEntries = 0;
let attemptedLookup = false;
let skippedTarget = false;
let targetWithRange = false;

async function retry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const backoff = /HTTP 429|HTTP 403/.test(e.message) ? 30_000 * (i + 1) : 2_000 * (i + 1);
      console.error(`   ! ${e.message} — retry in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
  throw last;
}

for (const ed of hadithTargets) {
  const bookId = String(ed.book_id);
  const to = TO || ed.last_number || 0;
  if (!to) {
    skippedTarget = true;
    console.error(`✖ ${bookId}: no --to and no last_number in canonical data — skipping`);
    continue;
  }
  targetWithRange = true;
  console.log(`\n== ${bookId} ${ed.title ?? ""} — numbers ${FROM}..${to} step ${STEP} ==`);
  const prev = index.books[bookId]?.type === "hadith" ? index.books[bookId] : { type: "hadith", index: {}, reverse: {} };
  const forward = { ...prev.index };
  const reverse = Object.fromEntries(Object.entries(prev.reverse ?? {}).map(([k, v]) => [k, [...v]]));
  const pageNumbers = new Map(); // page → Set(numbers claimed by specialnumber2id)
  let missing = 0;

  for (let n = FROM; n <= to; n += STEP) {
    if (forward[n]?.verified) continue; // resume support
    attemptedLookup = true;
    let page;
    try {
      page = await retry(() => client.hadithPageId(bookId, n));
    } catch (e) {
      console.error(`   ! ${n}: ${e.message}`);
      continue;
    }
    if (!page) {
      missing += 1;
      continue;
    }
    if (!pageNumbers.has(page)) pageNumbers.set(page, new Set());
    pageNumbers.get(page).add(String(n));
    if (n % 100 === 0) console.log(`   … ${n}/${to} (${pageNumbers.size} pages so far)`);
    await sleep(DELAY_MS);
  }

  // Verify on-page and build maps.
  let verified = 0;
  let unverified = 0;
  for (const [page, nums] of pageNumbers) {
    let pd;
    try {
      pd = await retry(() => client.bookPage(bookId, page));
    } catch (e) {
      console.error(`   ! page ${page}: ${e.message}`);
      continue;
    }
    const onPage = new Set(detectHadithMarkers(pd.paragraphs).map((m) => m.number));
    for (const n of nums) {
      const ok = onPage.has(n);
      if (ok) verified += 1;
      else unverified += 1;
      forward[n] = { page, verified: ok, ...(ok ? {} : { note: "specialnumber2id pointed here but marker not printed on page" }) };
      if (ok && !(reverse[page] ?? []).includes(n)) (reverse[page] ||= []).push(n);
      newEntries += 1;
    }
    await sleep(DELAY_MS);
  }
  for (const k of Object.keys(reverse)) reverse[k].sort((a, b) => Number(a) - Number(b));
  index.books[bookId] = { type: "hadith", ...(ed.key ? { key: ed.key } : {}), index: forward, reverse };
  console.log(`   ✔ ${verified} verified, ${unverified} unverified (kept with note), ${missing} numbers not found by shamela`);
}

const total = Object.values(index.books).reduce((n, b) => n + Object.keys(b.index ?? {}).length, 0);
console.log(`\nIndex: ${Object.keys(index.books).length} book(s), ${total} entries (${newEntries} touched this run).`);

if (!newEntries && !FORCE) {
  if (targetWithRange && !attemptedLookup && !skippedTarget) {
    console.log("✔ No new entries — existing index is already complete; nothing to write.");
    process.exit(0);
  }
  console.error("✖ Zero new entries — existing index NOT overwritten (use --force to write anyway).");
  process.exit(1);
}
if (DRY_RUN) {
  console.log(`--dry-run: would write ${OUT_PATH}`);
  process.exit(0);
}
writeFileSync(
  OUT_PATH,
  `/**\n * GENERATED by scripts/build-hadith-index.mjs — do not hand-edit.\n * Source: shamela.ws /ajax/specialnumber2id + on-page marker verification.\n * Re-run: npm run build:index\n */\nexport default ${JSON.stringify(index)};\n`,
);
console.log(`✔ Wrote ${OUT_PATH}`);
