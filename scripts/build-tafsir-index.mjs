/**
 * Build / refresh the persisted TAFSIR index (src/data/tafsir-index.mjs) from
 * live shamela.ws. Offline job — the Worker never walks a book at request time.
 *
 *   npm run build:tafsir -- --tafsir 8473 [--delay=400] [--from=<page>] [--to=<page>]
 *                                        [--surah=2,3] [--ranges-only] [--dry-run] [--force]
 *
 * WHAT IT PERSISTS, per book:
 *   surahs["<n>"] = { start, end, heading, source }
 *     Surah page ranges. Starts come from the TOC («تفسير سورة X», «سورة X»,
 *     «فاتحة الكتاب», «سورتي المعوذتين» …) AND from in-text headings met while
 *     walking (Ibn Kathir 8473 prints «سورة الشعراء» and «تفسير سورة العنكبوت»
 *     as paragraphs without a TOC entry). Each surah's end = the page before
 *     the next surah's start; the last surah ends on the book's last page.
 *   ayahs["<surah>:<ayah>"] = "<page>"
 *     First page whose Qur'anic bracket «﴿…(n)…﴾» carries that ayah number,
 *     recorded while walking every page of the book sequentially (the bracket
 *     may be split across a page break; page-edge halves are recognised).
 *
 * HOW:
 *   1. details(book) → TOC → surah starts.
 *   2. Walk pages from --from (default: first surah start) to --to (default:
 *      book's last page). Every page: detect in-text surah headings (can start
 *      a surah that had no TOC entry) and bracket ayah numbers for the current
 *      surah. Sequential, --delay ms between pages (default 400).
 *   3. Merge into the existing index (never drops entries), recompute ranges,
 *      write src/data/tafsir-index.mjs.
 *
 *   Cost for 8473: ~4 440 pages → ~30 min at 400 ms. Use --from/--to (page
 *   ids) or --surah to do it in resumable slices; --ranges-only skips the walk
 *   and only refreshes the TOC-derived ranges (cheap; cannot discover surahs
 *   that lack a TOC entry — those keep their previously persisted start).
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { AYAH_COUNTS, surahHeadingInParagraph, quranBracketAyahsInParagraph } from "../src/lib/citation-detect.mjs";
import { surahStartsFromToc, surahRangesFromStarts } from "../src/lib/hadith-index.mjs";
import existing from "../src/data/tafsir-index.mjs";
import canonicalBookIds from "../src/data/canonical-book-ids.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/tafsir-index.mjs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const RANGES_ONLY = args.includes("--ranges-only");
const opt = (name, fallback) => {
  const v = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  return v === undefined || v === "" ? fallback : v;
};
const DELAY_MS = Number(opt("delay", 400));
const FROM = Number(opt("from", 0));
const TO = Number(opt("to", 0));
const SURAHS = String(opt("surah", ""))
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n >= 1 && n <= 114);
const list = (flag) => args.flatMap((a, i) => (a === flag && /^\d+$/.test(args[i + 1] ?? "") ? [args[i + 1]] : []));

const editions = Object.entries(canonicalBookIds?.editions ?? {}).map(([key, rec]) => ({ key, ...rec }));
const explicit = list("--tafsir");
const targets = explicit.length
  ? explicit.map((id) => editions.find((e) => String(e.book_id) === id) ?? { key: null, book_id: id, type: "tafsir" })
  : editions.filter((e) => e.type === "tafsir");
if (!targets.length) {
  console.error("✖ Nothing to index. Pass --tafsir <id> (e.g. 8473).");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const http = createHttp({ ttl: 0 });
const client = createClient({ text: http.text });
const index = { generated_at: new Date().toISOString(), books: { ...(existing?.books ?? {}) } };
let touched = 0;

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

/** Surah whose persisted/collected range contains `page` (0 if none). */
function surahAtPage(starts, page) {
  let best = 0;
  let bestPage = -1;
  for (const [s, info] of starts) {
    const p = Number(info.page);
    if (p <= page && p > bestPage) {
      bestPage = p;
      best = s;
    }
  }
  return best;
}

for (const ed of targets) {
  const bookId = String(ed.book_id);
  console.log(`\n== ${bookId} ${ed.title ?? ""} — tafsir index ==`);
  const prev = index.books[bookId]?.type === "tafsir" ? index.books[bookId] : { type: "tafsir", surahs: {}, ayahs: {} };

  // 1. TOC-derived starts, merged with previously persisted starts (which may
  //    include page_heading discoveries from an earlier walk).
  const d = await retry(() => client.details(bookId));
  const starts = surahStartsFromToc(d.toc ?? []);
  for (const [s, r] of Object.entries(prev.surahs ?? {})) {
    const n = Number(s);
    if (!starts.has(n) || (starts.get(n).shared && r.source !== "toc_shared_heading")) {
      starts.set(n, { page: String(r.start), heading: r.heading, shared: false, source: r.source ?? "persisted" });
    }
  }
  console.log(`   TOC: ${d.toc?.length ?? 0} entries → ${starts.size} surah starts (with persisted merges)`);

  // Last page of the book (from any page's nav).
  const firstStart = [...starts.values()].map((v) => Number(v.page)).sort((a, b) => a - b)[0] ?? 1;
  const probe = await retry(() => client.bookPage(bookId, firstStart));
  const lastPage = Number(probe.nav?.last ?? prev.last_page ?? 0);
  if (!lastPage) {
    console.error("   ✖ could not determine last page — skipping");
    continue;
  }

  const ayahs = { ...(prev.ayahs ?? {}) };

  // 2. Sequential walk.
  if (!RANGES_ONLY) {
    let walkFrom = FROM || firstStart;
    let walkTo = TO || lastPage;
    if (SURAHS.length) {
      const ranges = surahRangesFromStarts(starts, lastPage);
      const sel = SURAHS.map((n) => ranges[String(n)]).filter(Boolean);
      if (!sel.length) {
        console.error(`   ✖ none of --surah=${SURAHS.join(",")} has a known start yet`);
        continue;
      }
      walkFrom = Math.min(...sel.map((r) => Number(r.start)));
      walkTo = Math.max(...sel.map((r) => Number(r.end)));
    }
    console.log(`   walking pages ${walkFrom}..${walkTo} (delay ${DELAY_MS} ms)`);

    let page = walkFrom;
    let current = surahAtPage(starts, page);
    let carry = null; // last paragraph of the previous page, for split blocks / headings at page end
    let walked = 0;
    let newAyahs = 0;
    while (page && page <= walkTo) {
      let pd;
      try {
        pd = await retry(() => client.bookPage(bookId, page));
      } catch (e) {
        console.error(`   ! page ${page}: ${e.message} — stopping walk here (resume with --from=${page})`);
        break;
      }
      const paras = (pd.paragraphs ?? []).map((p) => String(p ?? ""));

      // In-text surah headings. A heading printed as the LAST paragraph of a
      // page that still carries the previous surah's text (8473 p.3167:
      // «آخر تفسير سورة القصص» … «تفسير سورة العنكبوت») starts the surah on the
      // NEXT page, where its text actually begins — handled via `carry`.
      const found = []; // [surah, headingText]
      if (carry) for (const s of surahHeadingInParagraph(carry)) found.push([s, carry]);
      paras.forEach((p, i) => {
        if (i === paras.length - 1 && paras.length > 1) return; // deferred to the next page
        for (const s of surahHeadingInParagraph(p)) found.push([s, p]);
      });
      for (const [s, text] of found) {
        const known = starts.get(s);
        if (!known || known.shared || Number(known.page) > page) {
          starts.set(s, { page: String(page), heading: text.trim().replace(/^\[|\]$/g, "").slice(0, 60), shared: false, source: "page_heading" });
          console.log(`   + surah ${s} starts at page ${page} (in-text heading)`);
          touched += 1;
        }
      }
      const here = surahAtPage(starts, page);
      if (here !== current) current = here;

      if (current) {
        const count = AYAH_COUNTS[current] ?? 0;
        const marks = new Set();
        paras.forEach((p, i) => {
          for (const a of quranBracketAyahsInParagraph(p, current, { first: i === 0, last: i === paras.length - 1 })) marks.add(a);
        });
        // A block that opened on the previous page and closes here belongs to
        // that previous page for ayahs printed there — only new numbers count.
        for (const a of marks) {
          if (a < 1 || a > count) continue;
          const key = `${current}:${a}`;
          if (!ayahs[key]) {
            ayahs[key] = String(page);
            newAyahs += 1;
            touched += 1;
          }
        }
      }

      carry = paras.length ? paras[paras.length - 1] : null;
      walked += 1;
      if (walked % 100 === 0) console.log(`   … page ${page} (surah ${current}); ${newAyahs} new ayah entries so far`);
      const next = Number(pd.nav?.next ?? 0);
      page = next && next > page ? next : page + 1;
      if (page > lastPage) break;
      await sleep(DELAY_MS);
    }
    console.log(`   ✔ walked ${walked} pages, ${newAyahs} new ayah entries`);
  } else {
    console.log("   --ranges-only: skipping the page walk");
  }

  // 3. Persist.
  const surahs = surahRangesFromStarts(starts, lastPage);
  const missing = [];
  for (let n = 1; n <= 114; n += 1) if (!surahs[String(n)]) missing.push(n);
  if (missing.length) console.warn(`   ⚠ surahs without a known start: ${missing.join(", ")} (walk the whole book to discover in-text headings)`);
  // Sanity: every ayah must lie inside its surah's range; drop the ones that don't (and say so).
  let dropped = 0;
  for (const [key, pg] of Object.entries(ayahs)) {
    const [s] = key.split(":").map(Number);
    const r = surahs[String(s)];
    if (!r || Number(pg) < Number(r.start) || Number(pg) > Number(r.end)) {
      delete ayahs[key];
      dropped += 1;
    }
  }
  if (dropped) console.warn(`   ⚠ dropped ${dropped} ayah entries that fell outside their surah's range`);
  const sortedAyahs = Object.fromEntries(
    Object.entries(ayahs).sort(([a], [b]) => {
      const [a1, a2] = a.split(":").map(Number);
      const [b1, b2] = b.split(":").map(Number);
      return a1 - b1 || a2 - b2;
    }),
  );
  const prevSurahCount = Object.keys(prev.surahs ?? {}).length;
  if (Object.keys(surahs).length !== prevSurahCount) touched += 1;
  index.books[bookId] = {
    type: "tafsir",
    ...(ed.key ? { key: ed.key } : {}),
    ...(ed.title || d.title ? { title: ed.title ?? d.title } : {}),
    last_page: String(lastPage),
    source: `scripts/build-tafsir-index.mjs — TOC of shamela.ws/book/${bookId} + sequential page walk (in-text surah headings, ﴿…(n)…﴾ ayah brackets). Generated ${index.generated_at}.`,
    surahs,
    ayahs: sortedAyahs,
  };
  console.log(`   ${Object.keys(surahs).length}/114 surah ranges, ${Object.keys(sortedAyahs).length} ayah entries`);
}

if (!touched && !FORCE) {
  console.error("✖ Nothing changed — existing index NOT overwritten (use --force to write anyway).");
  process.exit(1);
}
if (DRY_RUN) {
  console.log(`--dry-run: would write ${OUT_PATH}`);
  process.exit(0);
}
writeFileSync(
  OUT_PATH,
  `/**
 * Persisted tafsir index: surah → shamela page range, and surah:ayah → the
 * first page whose Qur'anic bracket «﴿…(n)…﴾» carries that ayah number.
 *
 * GENERATED / MERGED by scripts/build-tafsir-index.mjs — do not hand-edit
 * entries. The tool layer never walks a book at request time: it answers
 * from \`ayahs\` in O(1), or searches inside the surah's \`surahs[n]\` range
 * (bounded page fetches) and never leaves that range.
 *
 * Schema:
 *   books["<book_id>"] = {
 *     type: "tafsir", key?, title?, last_page, source,
 *     surahs: { "<n>": { start, end, heading, source: "toc"|"toc_shared_heading"|"page_heading" } },
 *     ayahs:  { "<surah>:<ayah>": "<page_id>" }
 *   }
 */
export default ${JSON.stringify(index, null, 1)};
`,
);
console.log(`✔ Wrote ${OUT_PATH}`);
