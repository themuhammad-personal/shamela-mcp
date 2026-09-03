import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_EDITIONS,
  CANONICAL_BOOK_IDS,
  OTHER_EDITION_IDS,
  normalizeArabic,
  detectWork,
  detectCanonicalEdition,
  isCanonicalNumbering,
  canonicalFields,
  canonicalRecord,
  canonicalMapStatus,
} from "../src/canonical-editions.mjs";

test("normalizeArabic folds common variants", () => {
  assert.equal(normalizeArabic("صحيح البخارى"), normalizeArabic("صحيح البخاري"));
  assert.equal(normalizeArabic("أبو غدة"), normalizeArabic("ابو غده"));
  assert.equal(normalizeArabic("مُحَمَّد"), "محمد");
});

test("whitelist: the nine hand-verified canonical ids are present", () => {
  const ids = Object.fromEntries(CANONICAL_EDITIONS.map((e) => [e.key, String(e.book_id)]));
  assert.deepEqual(ids, {
    "sahih-al-bukhari": "1681",
    "sahih-muslim": "1727",
    "sunan-abi-dawud": "1726",
    "jami-at-tirmidhi": "1435",
    "sunan-an-nasai": "829",
    "sunan-ibn-majah": "1198",
    "muwatta-malik": "1699",
    "musnad-ahmad": "25794",
    "tafsir-ibn-kathir": "8473",
  });
  assert.equal(canonicalMapStatus().verified_book_ids, 9);
  assert.ok(canonicalMapStatus().known_other_editions > 15);
});

test("every whitelisted record is complete", () => {
  for (const e of CANONICAL_EDITIONS) {
    assert.ok(/^\d+$/.test(String(e.book_id)), `${e.key} book_id`);
    assert.ok(e.title && e.numbering && e.numbering_roman && e.note, `${e.key} fields`);
    assert.ok(["hadith", "tafsir"].includes(e.type), `${e.key} type`);
    if (e.type === "hadith" && e.key !== "muwatta-malik") assert.ok(e.last_number > 1000, `${e.key} last_number`);
    for (const o of e.other_editions ?? []) assert.ok(/^\d+$/.test(String(o.book_id)), `${e.key} other ${o.title}`);
  }
});

test("no book_id is both canonical and 'other edition'", () => {
  for (const id of CANONICAL_BOOK_IDS.keys()) assert.equal(OTHER_EDITION_IDS.has(id), false, id);
});

test("verified id → is_canonical_numbering true, confidence verified", () => {
  const f = canonicalFields({ book_id: "1681", title: "anything" });
  assert.equal(f.is_canonical_numbering, true);
  assert.equal(f.canonical_edition.confidence, "verified");
  assert.equal(f.canonical_edition.key, "sahih-al-bukhari");
  assert.equal(isCanonicalNumbering({ book_id: 1727 }), true);
});

test("known other edition → false, points at the canonical id", () => {
  const f = canonicalFields({ book_id: "735", title: "صحيح البخاري - ت البغا" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition.confidence, "other_edition");
  assert.equal(f.canonical_edition.canonical_book_id, "1681");
});

test("muhaqqiq name is NOT evidence of numbering (regression: 1681 has a different محقق)", () => {
  // Old heuristic would have said false for 1681 (محقق = محمد زهير الناصر) and
  // true for a sharh whose محقق happens to be Abd al-Baqi. Both were wrong.
  assert.equal(canonicalFields({ book_id: "1681", muhaqqiq: "محمد زهير بن ناصر الناصر" }).is_canonical_numbering, true);
  const sharh = canonicalFields({ title: "شرح صحيح البخاري", muhaqqiq: "محمد فؤاد عبد الباقي" });
  assert.equal(sharh.is_canonical_numbering, false);
  assert.equal(sharh.canonical_edition.confidence, "title");
  assert.equal(sharh.canonical_edition.derivative, true);
});

test("title-only → false but names the canonical book_id to use", () => {
  const f = canonicalFields({ title: "صحيح مسلم" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition.confidence, "title");
  assert.equal(f.canonical_edition.canonical_book_id, "1727");
  assert.equal(isCanonicalNumbering({ title: "صحيح مسلم" }), false);
  assert.equal(isCanonicalNumbering({ title: "صحيح مسلم" }, { allowTitleOnly: true }), false, "title-only can never assert canonical");
});

test("detectWork recognises real shamela titles and flags derivatives", () => {
  assert.equal(detectWork("صحيح البخاري - ط السلطانية").key, "sahih-al-bukhari");
  assert.equal(detectWork("سنن الترمذي - ت شاكر").key, "jami-at-tirmidhi");
  assert.equal(detectWork("تفسير ابن كثير - ت السلامة").key, "tafsir-ibn-kathir");
  assert.equal(detectWork("فتح الباري شرح صحيح البخاري").derivative, true);
  assert.equal(detectWork("مختصر تفسير ابن كثير").derivative, true);
  assert.equal(detectWork("رياض الصالحين"), null);
});

test("unrelated book → false, null", () => {
  const f = canonicalFields({ book_id: "5", title: "رياض الصالحين", muhaqqiq: "النووي" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition, null);
  assert.equal(detectCanonicalEdition({}), null);
});

test("canonicalRecord exposes last_number for range checks", () => {
  assert.equal(canonicalRecord("1681").last_number, 7563);
  assert.equal(canonicalRecord("1727").last_number, 3033);
  assert.equal(canonicalRecord("999999"), null);
});
