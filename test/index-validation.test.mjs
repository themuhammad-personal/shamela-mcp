import { test } from "node:test";
import assert from "node:assert/strict";

import { validateIndexes } from "../scripts/lib/index-validation.mjs";

const AYAH_COUNTS = [0, 7, 286, 200]; // surah 1: 7 ayahs, surah 2: 286, surah 3: 200

const CANONICAL = {
  editions: {
    "sahih-al-bukhari": { book_id: "1681", type: "hadith", title: "صحيح البخاري", last_number: 7563 },
    "muwatta-malik": { book_id: "1699", type: "hadith", title: "موطأ مالك", perKitabNumbering: true },
    "tafsir-ibn-kathir": { book_id: "8473", type: "tafsir", title: "تفسير ابن كثير" },
  },
};

function baseHadithIndex(overrides = {}) {
  return {
    books: {
      "1681": {
        type: "hadith",
        index: { "1": { page: "p1", verified: true } },
        reverse: { p1: ["1"] },
      },
      ...overrides,
    },
  };
}

function baseTafsirIndex(overrides = {}) {
  return {
    books: {
      "8473": {
        type: "tafsir",
        surahs: { "1": { start: "1", end: "10" } },
        ayahs: { "1:1": "p1" },
      },
      ...overrides,
    },
  };
}

test("valid hadith and tafsir indexes pass with no baseline", () => {
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(),
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "passed");
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 2); // no baseline for either file
});

test("Muwatta 1699 is rejected from the global hadith index even if well-formed", () => {
  const report = validateIndexes({
    hadithIndex: baseHadithIndex({
      "1699": {
        type: "hadith",
        index: { "1": { page: "p1", verified: true } },
        reverse: { p1: ["1"] },
      },
    }),
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("1699") && e.includes("Muwatta rule")));
});

test("a book_id absent from the canonical whitelist is rejected", () => {
  const report = validateIndexes({
    hadithIndex: baseHadithIndex({
      "999999": {
        type: "hadith",
        index: { "1": { page: "p1", verified: true } },
        reverse: { p1: ["1"] },
      },
    }),
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("999999") && e.includes("canonical whitelist")));
});

test("reverse-index inconsistency is detected both directions", () => {
  const report = validateIndexes({
    hadithIndex: {
      books: {
        "1681": {
          type: "hadith",
          index: { "1": { page: "p1", verified: true } },
          reverse: { p1: ["2"] }, // wrong number
        },
      },
    },
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("missing from reverse")));
});

test("a hadith number beyond the canonical last_number is rejected", () => {
  const report = validateIndexes({
    hadithIndex: {
      books: {
        "1681": {
          type: "hadith",
          index: { "99999": { page: "p1", verified: true } },
          reverse: { p1: ["99999"] },
        },
      },
    },
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("exceeds the canonical last_number")));
});

test("an ayah key outside canonical Quran bounds is rejected", () => {
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(),
    tafsirIndex: baseTafsirIndex({
      "8473": {
        type: "tafsir",
        surahs: { "1": { start: "1", end: "10" } },
        ayahs: { "1:8": "p1" }, // surah 1 has only 7 ayahs
      },
    }),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("outside canonical Quran bounds")));
});

test("an out-of-range surah key (>114 semantics via small fixture) is rejected", () => {
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(),
    tafsirIndex: baseTafsirIndex({
      "8473": {
        type: "tafsir",
        surahs: { "0": { start: "1", end: "10" } },
        ayahs: {},
      },
    }),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("out-of-bounds surah key")));
});

test("coverage regression against the baseline fails the run for hadith", () => {
  const baselineHadith = {
    books: {
      "1681": {
        type: "hadith",
        index: {
          "1": { page: "p1", verified: true },
          "2": { page: "p2", verified: true },
        },
        reverse: { p1: ["1"], p2: ["2"] },
      },
    },
  };
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(), // only 1 verified entry now
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
    baselineHadith,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("verified-entry count dropped")));
  assert.equal(report.hadith["1681"].regression, true);
});

test("coverage regression against the baseline fails the run for tafsir", () => {
  const baselineTafsir = {
    books: {
      "8473": {
        type: "tafsir",
        surahs: { "1": { start: "1", end: "10" } },
        ayahs: { "1:1": "p1", "1:2": "p2" },
      },
    },
  };
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(),
    tafsirIndex: baseTafsirIndex(), // only 1 mapped ayah now
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
    baselineTafsir,
  });
  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((e) => e.includes("mapped-ayah count dropped")));
  assert.equal(report.tafsir["8473"].regression, true);
});

test("equal or improved coverage versus baseline does not regress", () => {
  const baselineHadith = {
    books: {
      "1681": {
        type: "hadith",
        index: { "1": { page: "p1", verified: true } },
        reverse: { p1: ["1"] },
      },
    },
  };
  const report = validateIndexes({
    hadithIndex: baseHadithIndex(),
    tafsirIndex: baseTafsirIndex(),
    canonicalEditions: CANONICAL,
    ayahCounts: AYAH_COUNTS,
    baselineHadith,
  });
  assert.equal(report.status, "passed");
  assert.equal(report.hadith["1681"].regression, false);
});
