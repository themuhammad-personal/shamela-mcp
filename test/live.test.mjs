import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { hasNassContainer } from "../src/lib/page.mjs";
import { detectHadithMarkers, detectQuranBracketAyahs, ayahHeadingInParagraph } from "../src/lib/citation-detect.mjs";
import tafsirIndex from "../src/data/tafsir-index.mjs";

const enabled = process.env.SHAMELA_LIVE_TESTS === "1";
const live = enabled ? test : test.skip;
const http = createHttp({ ttl: 0, timeoutMs: 20_000, maxRetries: 2, maxConcurrent: 1 });
const client = createClient({ text: http.text });

/**
 * Scans forward from a surah's TOC start page looking for `predicate` on the
 * page content, bounded like the real bisection search (never an unbounded
 * walk). This deliberately replaces a single hardcoded page number: a fixed
 * "page 482 has the marker" assumption drifts the moment Shamela's content
 * shifts by even one paragraph, and previously meant this canary silently
 * asserted against the same magic page across three unrelated books with
 * three different pagination schemes. Scanning from the TOC-verified start
 * of the surah is the same ground truth the production tool relies on.
 */
async function findPageWhere(bookId, startPage, predicate, { maxScan = 20 } = {}) {
  const start = Number(startPage);
  for (let offset = 0; offset <= maxScan; offset += 1) {
    const pageNumber = String(start + offset);
    const page = await client.bookPage(bookId, pageNumber);
    if (predicate(page)) return { pageNumber, page };
  }
  return null;
}

live("live canary: canonical Muslim marker and nass container", async () => {
  const pageId = await client.hadithPageId("1727", "8");
  assert.ok(pageId, "specialnumber2id marker lookup disappeared");
  const raw = await http.text(`https://shamela.ws/book/1727/${pageId}`);
  assert.equal(hasNassContainer(raw), true, "div.nass marker drifted");
  const page = await client.bookPage("1727", pageId);
  assert.ok(detectHadithMarkers(page.paragraphs).some((entry) => entry.number === "8"), "hadith paragraph marker drifted");
  // NOTE: this Muslim edition (1727) does not hyperlink isnad narrator names
  // to /narrator/<id> on this page (confirmed live: 0 anchors in the raw
  // HTML) -- that's an edition/content fact, not a parser bug. Narrator
  // anchors ARE present in Bukhari (1681), which the next test canaries.
});

live("live canary: Bukhari narrator anchors are parsed off the page", async () => {
  // Hadith #1's isnad (al-Humaydi -> Sufyan -> Yahya b. Sa'id -> ... ) is
  // Shamela's own canonical hyperlinked example; confirmed live to carry 6
  // /narrator/<id> anchors as of this check.
  const pageId = await client.hadithPageId("1681", "1");
  assert.ok(pageId, "specialnumber2id marker lookup disappeared for Bukhari");
  const page = await client.bookPage("1681", pageId);
  assert.ok(page.narrator_links?.length > 0, "/narrator/<id> anchors drifted or disappeared from Bukhari");
});

live("live canary: Ibn Kathir Quran bracket markers near surah 2's TOC start", async () => {
  const surahStart = tafsirIndex.books["8473"].surahs["2"].start;
  const hit = await findPageWhere("8473", surahStart, (page) => detectQuranBracketAyahs(page.paragraphs, 2).length > 0);
  assert.ok(hit, `no Ibn Kathir page within ${surahStart}..+20 carries a surah-2 Quran bracket marker`);
});

live("live canary: Tabari main text is reachable near surah 2's TOC start", async () => {
  const surahStart = tafsirIndex.books["7798"].surahs["2"].start;
  const page = await client.bookPage("7798", String(surahStart));
  assert.ok(page.paragraphs.length > 0, "Tabari main text is unavailable");
});

live("live canary: Qurtubi editorial ayah heading near surah 2's TOC start", async () => {
  const surahStart = tafsirIndex.books["20855"].surahs["2"].start;
  const hit = await findPageWhere("20855", surahStart, (page) =>
    page.paragraphs.some((paragraph) => ayahHeadingInParagraph(paragraph, 2).length),
  );
  assert.ok(hit, `no Qurtubi page within ${surahStart}..+20 carries a surah-2 editorial ayah heading`);
});

live("live canary: narrator biography remains attributed source data", async () => {
  const narrator = await client.narratorTarjama("4210");
  assert.equal(narrator.found, true, "known narrator card no longer parses");
  assert.ok(narrator.name, "narrator name marker drifted");
});
