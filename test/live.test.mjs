import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";
import { hasNassContainer } from "../src/lib/page.mjs";
import { detectHadithMarkers, detectQuranBracketAyahs, ayahHeadingInParagraph } from "../src/lib/citation-detect.mjs";

const enabled = process.env.SHAMELA_LIVE_TESTS === "1";
const live = enabled ? test : test.skip;
const http = createHttp({ ttl: 0, timeoutMs: 20_000, maxRetries: 2, maxConcurrent: 1 });
const client = createClient({ text: http.text });

live("live canary: canonical Muslim marker, nass container, and narrator anchors", async () => {
  const pageId = await client.hadithPageId("1727", "8");
  assert.ok(pageId, "specialnumber2id marker lookup disappeared");
  const raw = await http.text(`https://shamela.ws/book/1727/${pageId}`);
  assert.equal(hasNassContainer(raw), true, "div.nass marker drifted");
  const page = await client.bookPage("1727", pageId);
  assert.ok(detectHadithMarkers(page.paragraphs).some((entry) => entry.number === "8"), "hadith paragraph marker drifted");
  assert.ok(page.narrator_links.length > 0, "/narrator/<id> anchors drifted or disappeared");
});

live("live canary: Ibn Kathir/Tabari Quran brackets and Qurtubi headings", async () => {
  const ibnKathir = await client.bookPage("8473", "482");
  assert.ok(detectQuranBracketAyahs(ibnKathir.paragraphs, 2).length > 0, "Ibn Kathir Quran bracket markers drifted");
  const tabari = await client.bookPage("7798", "482");
  assert.ok(tabari.paragraphs.length > 0, "Tabari main text is unavailable");
  const qurtubi = await client.bookPage("20855", "482");
  assert.ok(qurtubi.paragraphs.some((paragraph) => ayahHeadingInParagraph(paragraph, 2).length), "Qurtubi editorial ayah heading drifted");
});

live("live canary: narrator biography remains attributed source data", async () => {
  const narrator = await client.narratorTarjama("4210");
  assert.equal(narrator.found, true, "known narrator card no longer parses");
  assert.ok(narrator.name, "narrator name marker drifted");
});
