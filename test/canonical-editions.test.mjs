import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_EDITIONS,
  normalizeArabic,
  detectCanonicalEdition,
  isCanonicalNumbering,
  canonicalFields,
  CANONICAL_BOOK_IDS,
} from "../src/canonical-editions.mjs";

test("normalizeArabic folds common variants", () => {
  // hamza forms, alef-maqsura, ta-marbuta, harakat, tatweel
  assert.equal(normalizeArabic("صحيح البخارى"), normalizeArabic("صحيح البخاري"));
  assert.equal(normalizeArabic("النسائي"), normalizeArabic("النسائى"));
  assert.equal(normalizeArabic("أبو غدة"), normalizeArabic("ابو غده"));
  assert.equal(normalizeArabic("مُحَمَّد"), "محمد");
});

test("detectCanonicalEdition: muhaqqiq match is strong", () => {
  const hit = detectCanonicalEdition({
    title: "صحيح البخاري",
    muhaqqiq: "تحقيق محمد فؤاد عبد الباقي",
  });
  assert.ok(hit);
  assert.equal(hit.key, "sahih-al-bukhari");
  assert.equal(hit.confidence, "author");
});

test("detectCanonicalEdition: different muhaqqiq → not canonical", () => {
  // A Bukhari edition checked by someone else must not be flagged canonical.
  const hit = detectCanonicalEdition({
    title: "صحيح البخاري",
    muhaqqiq: "تحقيق مصطفى ديب البغا",
  });
  assert.equal(hit, null);
});

test("detectCanonicalEdition: author is only a weak fallback for muhaqqiq", () => {
  // The original author (al-Bukhari) is the same across editions — it is NOT
  // evidence of which edition. Passing only `author` must not assert canonical.
  const hit = detectCanonicalEdition({ title: "صحيح البخاري", author: "البخاري" });
  assert.equal(hit, null);
});

test("detectCanonicalEdition: title-only match is weak", () => {
  const hit = detectCanonicalEdition({ title: "صحيح مسلم" });
  assert.ok(hit);
  assert.equal(hit.confidence, "title");
});

test("isCanonicalNumbering: title-only defaults to false (no guessing)", () => {
  assert.equal(isCanonicalNumbering({ title: "صحيح مسلم" }), false);
  assert.equal(isCanonicalNumbering({ title: "صحيح مسلم" }, { allowTitleOnly: true }), true);
  assert.equal(
    isCanonicalNumbering({ title: "صحيح مسلم", muhaqqiq: "محمد فؤاد عبد الباقي" }),
    true,
  );
});

test("isCanonicalNumbering: unrelated book → false", () => {
  assert.equal(isCanonicalNumbering({ title: "رياض الصالحين", author: "النووي" }), false);
});

test("each canonical edition has at least one title signature and authority", () => {
  for (const e of CANONICAL_EDITIONS) {
    assert.ok(e.titleSignatures.length > 0, `${e.key} has title signatures`);
    assert.ok(e.authorities.length > 0, `${e.key} has authorities`);
    assert.ok(e.authorityRoman, `${e.key} has romanized authority`);
  }
});

test("Tirmidhi authority is Ahmad Shakir, not Fuad Abd al-Baqi", () => {
  const hit = detectCanonicalEdition({ title: "جامع الترمذي", muhaqqiq: "أحمد محمد شاكر" });
  assert.ok(hit);
  assert.equal(hit.key, "jami-at-tirmidhi");
  assert.equal(hit.authorityRoman, "Ahmad Muhammad Shakir");
});

test("canonicalFields: verified book_id map is authoritative", () => {
  CANONICAL_BOOK_IDS.set("12345", { key: "sahih-al-bukhari", authorityRoman: "Muhammad Fuad Abd al-Baqi" });
  const f = canonicalFields({ book_id: "12345", title: "anything" });
  assert.equal(f.is_canonical_numbering, true);
  assert.equal(f.canonical_edition.confidence, "verified");
  CANONICAL_BOOK_IDS.delete("12345");
});

test("canonicalFields: muhaqqiq match → true", () => {
  const f = canonicalFields({ title: "صحيح البخاري", muhaqqiq: "محمد فؤاد عبد الباقي" });
  assert.equal(f.is_canonical_numbering, true);
  assert.equal(f.canonical_edition.confidence, "author");
});

test("canonicalFields: title-only → false but keeps edition hint", () => {
  const f = canonicalFields({ title: "صحيح مسلم" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition.confidence, "title");
});

test("canonicalFields: different muhaqqiq → null edition, false", () => {
  const f = canonicalFields({ title: "صحيح البخاري", muhaqqiq: "مصطفى ديب البغا" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition, null);
});

test("canonicalFields: unrelated book → false, null", () => {
  const f = canonicalFields({ title: "رياض الصالحين", muhaqqiq: "النووي" });
  assert.equal(f.is_canonical_numbering, false);
  assert.equal(f.canonical_edition, null);
});
