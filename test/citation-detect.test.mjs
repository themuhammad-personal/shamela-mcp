import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHadithNumbers, detectAyahs, SURAH_NAMES } from "../src/lib/citation-detect.mjs";

// --- hadith numbers -------------------------------------------------------

test("detectHadithNumbers: explicit رقم الحديث marker (Arabic-Indic digits)", () => {
  assert.deepEqual(detectHadithNumbers("حدثنا الحميدي ... الحديث رقم: ٨"), ["8"]);
  assert.deepEqual(detectHadithNumbers("برقم ١٢٣"), ["123"]);
});

test("detectHadithNumbers: leading 'N - ' line layout", () => {
  assert.deepEqual(detectHadithNumbers("٥ - حدثنا الحميدي"), ["5"]);
  assert.deepEqual(detectHadithNumbers("12 - حدثنا"), ["12"]);
});

test("detectHadithNumbers: collects several, de-duplicated, in order", () => {
  const out = detectHadithNumbers("١ - حدثنا\n٢ - أخبرنا\n٢ - أنبأنا");
  assert.deepEqual(out, ["1", "2"]);
});

test("detectHadithNumbers: no marker → empty array, never a guess", () => {
  assert.deepEqual(detectHadithNumbers("حدثنا الحميدي قال حدثنا سفيان"), []);
  assert.deepEqual(detectHadithNumbers(""), []);
  assert.deepEqual(detectHadithNumbers(null), []);
});

test("detectHadithNumbers: rejects leading-zero artefacts", () => {
  assert.deepEqual(detectHadithNumbers("٠٠٧ - حدثنا"), []);
});

// --- ayah references ------------------------------------------------------

test("detectAyahs: explicit سورة X: N", () => {
  assert.deepEqual(detectAyahs("قوله تعالى في سورة البقرة: ٢٥٥"), ["2:255"]);
});

test("detectAyahs: multi-word surah name (آل عمران)", () => {
  assert.deepEqual(detectAyahs("سورة آل عمران: 5"), ["3:5"]);
});

test("detectAyahs: the word الآية between name and number", () => {
  assert.deepEqual(detectAyahs("سورة المائدة الآية ٣"), ["5:3"]);
});

test("detectAyahs: expands an explicit range, capped", () => {
  assert.deepEqual(detectAyahs("سورة البقرة 10-12"), ["2:10", "2:11", "2:12"]);
  // a whole-surah span is a section heading, not 286 citations
  assert.equal(detectAyahs("سورة البقرة 1-200").length, 50);
});

test("detectAyahs: out-of-range ayah is dropped, not clamped", () => {
  assert.deepEqual(detectAyahs("سورة البقرة: 300"), []);
  assert.deepEqual(detectAyahs("سورة الناس: 7"), []); // الناس has 6 ayahs' worth of prose
});

test("detectAyahs: one-letter surah names are never matched (no fabrication)", () => {
  assert.deepEqual(detectAyahs("سورة ص 1"), []);
  assert.deepEqual(detectAyahs("سورة ق 1"), []);
});

test("detectAyahs: unlisted / prose-only text → empty", () => {
  assert.deepEqual(detectAyahs("ذكر المفسر أقوال العلماء في هذه المسألة"), []);
  assert.deepEqual(detectAyahs(""), []);
  assert.deepEqual(detectAyahs(null), []);
});

test("SURAH_NAMES covers 112 of 114 surahs (ص and ق excluded on purpose)", () => {
  assert.equal(SURAH_NAMES.length, 112);
  const numbers = SURAH_NAMES.map(([n]) => n);
  assert.equal(numbers.includes(38), false);
  assert.equal(numbers.includes(50), false);
  assert.equal(new Set(numbers).size, numbers.length, "no duplicate surah numbers");
  assert.equal(Math.max(...numbers), 114);
});
