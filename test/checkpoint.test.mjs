import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  validateCheckpoint,
  readCheckpoint,
  writeCheckpoint,
  resetCheckpoint,
  CHECKPOINT_VERSION,
} from "../scripts/lib/crawl-policy.mjs";

test("validateCheckpoint: accepts valid v1 and v2 checkpoint schemas", () => {
  const v1 = {
    version: 1,
    books: {
      "1681": { next_number: 10, walk_to: 100 },
    },
  };
  assert.equal(validateCheckpoint(v1), true);

  const v2 = {
    version: CHECKPOINT_VERSION,
    schema: "shamela-mcp-checkpoint",
    type: "hadith",
    books: {
      "1727": { next_number: 50, claims: { "62": ["8"] } },
    },
  };
  assert.equal(validateCheckpoint(v2, "hadith"), true);
  assert.equal(validateCheckpoint(v2, "tafsir"), false, "type mismatch rejected");
});

test("validateCheckpoint: rejects non-objects, arrays, bad versions, and non-numeric book IDs", () => {
  assert.equal(validateCheckpoint(null), false);
  assert.equal(validateCheckpoint([]), false);
  assert.equal(validateCheckpoint({ version: 99, books: {} }), false);
  assert.equal(validateCheckpoint({ version: 2 }), false);
  assert.equal(validateCheckpoint({ version: 2, books: { "not-a-number": {} } }), false);
  assert.equal(validateCheckpoint({ version: 2, books: { "1681": "invalid-state" } }), false);
});

test("readCheckpoint: reads valid checkpoint and safely falls back on corrupt/invalid file", () => {
  const scratchDir = mkdtempSync(resolve(tmpdir(), "shamela-cp-test-"));
  const cpPath = resolve(scratchDir, "checkpoint.json");

  try {
    const fallback = { version: 2, books: {} };
    // Non-existent file returns fallback
    assert.deepEqual(readCheckpoint(cpPath, fallback), fallback);

    // Write valid checkpoint
    writeCheckpoint(cpPath, {
      type: "tafsir",
      books: {
        "8473": { next_page: 500, walk_to: 1000 },
      },
    });
    assert.equal(existsSync(cpPath), true);
    const loaded = readCheckpoint(cpPath, fallback, "tafsir");
    assert.equal(loaded.version, CHECKPOINT_VERSION);
    assert.equal(loaded.books["8473"].next_page, 500);

    // Corrupt JSON file
    writeFileSync(cpPath, "{ corrupt json ...", "utf8");
    assert.deepEqual(readCheckpoint(cpPath, fallback), fallback);

    // Malformed schema file
    writeFileSync(cpPath, JSON.stringify({ version: 999, invalid: true }), "utf8");
    assert.deepEqual(readCheckpoint(cpPath, fallback), fallback);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test("resetCheckpoint: safely removes existing checkpoint without throwing on missing file", () => {
  const scratchDir = mkdtempSync(resolve(tmpdir(), "shamela-cp-reset-"));
  const cpPath = resolve(scratchDir, "checkpoint.json");

  try {
    writeCheckpoint(cpPath, { books: { "1681": {} } });
    assert.equal(existsSync(cpPath), true);
    resetCheckpoint(cpPath);
    assert.equal(existsSync(cpPath), false);

    // Repeating reset does not throw
    assert.doesNotThrow(() => resetCheckpoint(cpPath));
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});
