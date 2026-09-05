import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAyahHeading,
  ayahHeadingInParagraph,
  quranBracketAyahsInParagraph,
  detectQuranBracketAyahs,
} from "../src/lib/citation-detect.mjs";

test("isAyahHeading: identifies editorial headings across various formats", () => {
  // Standard Qurtubi heading with brackets, surah name, number, and single ayah
  assert.equal(isAyahHeading("[سورة البقرة (٢): آية ٨٠]"), true);
  // Heading with range using 'إلى'
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ٨١ إلى ٨٢]"), true);
  // Heading with range using 'الى'
  assert.equal(isAyahHeading("[سورة الناس (١١٤): الآيات ١ الى ٣]"), true);
  // Heading with hyphen range
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ١ - ٥]"), true);
  // Heading with en-dash / em-dash
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ١ – ٥]"), true);
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ١ — ٥]"), true);
  // Heading with comma-separated list
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ٦، ٧]"), true);
  // Heading without surrounding brackets
  assert.equal(isAyahHeading("سورة البقرة (٢): آية ٨٠"), true);
  assert.equal(isAyahHeading("سورة البقرة (٢): الآيات ١ إلى ٥"), true);
  // Heading without surah number (only surah name)
  assert.equal(isAyahHeading("[سورة البقرة: الآيات ١ إلى ٥]"), true);
  // Heading with section break without surah prefix (inside chapter)
  assert.equal(isAyahHeading("[الآيات ١ إلى ٥]"), true);
  assert.equal(isAyahHeading("[الآية ٨٠]"), true);
  assert.equal(isAyahHeading("[آية ٨٠]"), true);
  assert.equal(isAyahHeading("الآيات ١ - ٥"), true);
});

test("isAyahHeading: rejects invalid heading forms and regular prose", () => {
  assert.equal(isAyahHeading(""), false);
  assert.equal(isAyahHeading(null), false);
  assert.equal(isAyahHeading("سورة البقرة: ٢٥٥"), false, "bare prose citation");
  assert.equal(isAyahHeading("سورة الشعراء"), false, "surah heading, not ayah heading");
  assert.equal(isAyahHeading("تفسير سورة الفاتحة"), false, "surah TOC heading");
  assert.equal(isAyahHeading("قال في سورة البقرة (٢): آية ٨٠ ما نصه …"), false, "prose with quote");
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ٩٩٩ إلى ١٠٠٠]"), false, "out of bounds ayahs");
  assert.equal(isAyahHeading("[سورة البقرة (٢): الآيات ٥ إلى ١]"), false, "inverted range");
});

test("ayahHeadingInParagraph: parses ranges, single ayahs, and lists for matching surah", () => {
  // Single ayah
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): آية ٨٠]", 2), [80]);
  // Range with إلى
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): الآيات ١ إلى ٥]", 2), [1, 2, 3, 4, 5]);
  // Range with hyphen
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): الآيات ١ - ٥]", 2), [1, 2, 3, 4, 5]);
  // Comma-separated list
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): الآيات ٦، ٧]", 2), [6, 7]);
  // Mixed list and range
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): الآيات ١ - ٣، ٥]", 2), [1, 2, 3, 5]);
  // Surah without number in heading
  assert.deepEqual(ayahHeadingInParagraph("[سورة الفاتحة: الآيات ١ إلى ٧]", 1), [1, 2, 3, 4, 5, 6, 7]);
  // Surah-less heading within known surah
  assert.deepEqual(ayahHeadingInParagraph("[الآيات ١ إلى ٣]", 114), [1, 2, 3]);
  assert.deepEqual(ayahHeadingInParagraph("[آية ٤]", 114), [4]);
});

test("ayahHeadingInParagraph: rejects mismatched surahs and out-of-bounds ayahs", () => {
  // Mismatched surah number
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): آية ٨٠]", 3), []);
  // Mismatched surah name
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة: آية ٨٠]", 3), []);
  // Exceeds surah ayah count (surah 114 has 6 ayahs)
  assert.deepEqual(ayahHeadingInParagraph("[سورة الناس (١١٤): آية ٧]", 114), []);
  assert.deepEqual(ayahHeadingInParagraph("[سورة الناس (١١٤): الآيات ١ إلى ٨]", 114), []);
});

test("detectQuranBracketAyahs: combines bracket markers and editorial headings correctly", () => {
  const pageParas = [
    "[سورة البقرة (٢): الآيات ١ إلى ٥]",
    "الم (١) ذَلِكَ الْكِتَابُ لا رَيْبَ فِيهِ هُدىً لِلْمُتَّقِينَ (٢)",
    "الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ الصَّلاةَ وَمِمَّا رَزَقْنَاهُمْ يُنْفِقُونَ (٣)",
    "وَالَّذِينَ يُؤْمِنُونَ بِمَا أُنْزِلَ إِلَيْكَ وَمَا أُنْزِلَ مِنْ قَبْلِكَ وَبِالآخِرَةِ هُمْ يُوقِنُونَ (٤)",
    "أُولَئِكَ عَلَى هُدىً مِنْ رَبِّهِمْ وَأُولَئِكَ هُمُ الْمُفْلِحُونَ (٥)",
  ];
  const detected = detectQuranBracketAyahs(pageParas, 2);
  assert.deepEqual(detected, [1, 2, 3, 4, 5]);
});
