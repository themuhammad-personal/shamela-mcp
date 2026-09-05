import { test } from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifestStructure, evaluateCoverage } from "../scripts/lib/refresh-manifest.mjs";

test("loadManifest: loads and validates refresh-manifest.json successfully", () => {
  const manifest = loadManifest();
  assert.ok(manifest.hadith_targets.length >= 7);
  assert.equal(manifest.tafsir_targets.length, 3);
  assert.equal(manifest.policies.checkpoint_schema_version, 2);
});

test("validateManifestStructure: catches malformed targets", () => {
  assert.throws(() => validateManifestStructure(null), /Manifest must be an object/);
  assert.throws(() => validateManifestStructure({}), /hadith_targets/);
  assert.throws(() => validateManifestStructure({ hadith_targets: [], tafsir_targets: [{ book_id: "8473", surah_count: 50 }] }), /114 surahs/);
});

test("evaluateCoverage: computes percentages and completion state accurately", () => {
  const manifest = {
    hadith_targets: [
      { book_id: "1681", key: "bukhari", status: "active", last_number: 100 },
      { book_id: "1699", key: "muwatta", status: "restricted" },
    ],
    tafsir_targets: [
      { book_id: "8473", key: "ibn-kathir", surah_count: 114, last_page: 4588 },
    ],
  };

  const hadithIndex = {
    books: {
      "1681": {
        coverage: "partial",
        index: { "1": { page: "1", verified: true }, "2": { page: "1", verified: true } },
      },
    },
  };

  const tafsirIndex = {
    books: {
      "8473": {
        surahs: Object.fromEntries(Array.from({ length: 114 }, (_, i) => [String(i + 1), { start: "1", end: "10" }])),
        ayahs: { "1:1": "1" },
      },
    },
  };

  const coverage = evaluateCoverage(manifest, hadithIndex, tafsirIndex);
  assert.equal(coverage.hadith[0].indexed_count, 2);
  assert.equal(coverage.hadith[0].percent, 2.0);
  assert.equal(coverage.hadith[0].complete, false);
  assert.equal(coverage.hadith[1].status, "restricted");
  assert.equal(coverage.tafsir[0].surahs_complete, true);
  assert.equal(coverage.tafsir[0].ayah_count, 1);
});
