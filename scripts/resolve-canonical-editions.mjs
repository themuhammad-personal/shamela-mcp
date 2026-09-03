/**
 * Re-check the hand-verified canonical whitelist against live shamela.ws.
 *
 *   npm run resolve:canonical            # verify, exit 1 on any mismatch
 *   node scripts/resolve-canonical-editions.mjs --list "صحيح البخاري"   # list editions for a title
 *
 * This script no longer *writes* src/data/canonical-book-ids.mjs: the ids are
 * curated by hand (the file documents how). What it does:
 *   1. For each whitelisted hadith edition: `GET /ajax/specialnumber2id/<id>/1`
 *      must return a positive page id, and that page must print «١ -».
 *      For `last_number`: the page for last_number must print it and the page
 *      for last_number+1 must equal that of last_number (shamela clamps).
 *   2. For each whitelisted tafsir edition: specialnumber2id must be negative
 *      and the TOC must contain «تفسير سورة» chapters.
 *   3. `--list <title>`: dump every edition shamela hosts for that title so a
 *      human can update the whitelist if shamela adds/renames editions.
 */

import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { detectHadithNumbers, surahFromHeading } from "../src/lib/citation-detect.mjs";
import canonicalBookIds from "../src/data/canonical-book-ids.mjs";

const args = process.argv.slice(2);
const http = createHttp({ ttl: 0 });
const client = createClient({ text: http.text });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listIdx = args.indexOf("--list");
if (listIdx >= 0) {
  const q = args[listIdx + 1];
  const r = await client.titleSearch(q, 1, 30);
  for (const b of r.results) console.log(`${b.book_id}\t${b.title}`);
  process.exit(0);
}

let failures = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => {
  failures += 1;
  console.error(`  ✖ ${msg}`);
};

for (const [key, rec] of Object.entries(canonicalBookIds.editions)) {
  const id = String(rec.book_id);
  console.log(`\n== ${key} → ${id} (${rec.title})`);
  let d;
  try {
    d = await client.details(id);
  } catch (e) {
    bad(`details failed: ${e.message}`);
    continue;
  }
  ok(`title on shamela: ${d.title}`);

  if (rec.type === "hadith") {
    const p1 = await client.hadithPageId(id, 1);
    if (!p1) bad("specialnumber2id/1 returned no page — edition is not wired into hadith lookup");
    else {
      const page = await client.bookPage(id, p1);
      const nums = detectHadithNumbers(page.paragraphs);
      if (nums.includes("1")) ok(`hadith 1 → page ${p1} (marker present)`);
      else bad(`hadith 1 → page ${p1} but markers on page are [${nums.join(", ")}]`);
    }
    if (rec.last_number) {
      await sleep(300);
      const pl = await client.hadithPageId(id, rec.last_number);
      const pn = await client.hadithPageId(id, rec.last_number + 1);
      if (!pl) bad(`last_number ${rec.last_number} not found`);
      else {
        const page = await client.bookPage(id, pl);
        const nums = detectHadithNumbers(page.paragraphs);
        if (nums.includes(String(rec.last_number))) ok(`last_number ${rec.last_number} → page ${pl}`);
        else bad(`last_number ${rec.last_number} → page ${pl} but markers are [${nums.join(", ")}]`);
        if (pn && pn !== pl) bad(`last_number+1 resolves to a different page (${pn}) — last_number is too small`);
      }
    }
  } else {
    const p = await client.hadithPageId(id, 1);
    if (p) bad(`tafsir edition unexpectedly has hadith numbering (page ${p})`);
    else ok("no hadith numbering (expected for tafsir)");
    const surahs = new Set(d.toc.map((t) => surahFromHeading(t.title)).filter(Boolean));
    if (surahs.size >= 100) ok(`${surahs.size} surah chapters in TOC`);
    else bad(`only ${surahs.size} surah chapters detected in TOC`);
  }
  await sleep(500);
}

console.log(failures ? `\n✖ ${failures} check(s) failed` : "\n✔ whitelist verified");
process.exit(failures ? 1 : 0);
