import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { robotsAllows } from "../scripts/lib/crawl-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(script, ...args) {
  return spawnSync(process.execPath, [resolve(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("hadith index builder rejects malformed numeric options before any live work", () => {
  const result = run("build-hadith-index.mjs", "--from=not-a-number", "--dry-run");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--from must be a safe integer/);
  assert.equal(result.error, undefined);
});

test("hadith index builder rejects malformed book selectors instead of widening the run", () => {
  const result = run("build-hadith-index.mjs", "--book=not-a-book-id", "--dry-run");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--book requires a numeric book id/);
  assert.equal(result.error, undefined);
});

test("hadith index builder keeps tafsir selectors on the tafsir builder", () => {
  const result = run("build-hadith-index.mjs", "--tafsir=8473", "--dry-run");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /build-tafsir-index\.mjs/);
  assert.equal(result.error, undefined);
});

test("tafsir index builder rejects invalid surah selectors before any live work", () => {
  const result = run("build-tafsir-index.mjs", "--tafsir=8473", "--surah=0", "--dry-run");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--surah must contain/);
  assert.equal(result.error, undefined);
});

test("tafsir index builder allows the absent surah selector", () => {
  const result = run("build-tafsir-index.mjs", "--tafsir=8473", "--dry-run");
  assert.doesNotMatch(result.stderr, /--surah must contain/);
});

test("hadith builder rejects an oversized slice and unsafe global Muwatta indexing before network", () => {
  const oversized = run("build-hadith-index.mjs", "--book=1681", "--from=1", "--to=100", "--max-lookups=10", "--dry-run");
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /exceeds --max-lookups/);
  const muwatta = run("build-hadith-index.mjs", "--book=1699", "--dry-run");
  assert.notEqual(muwatta.status, 0);
  assert.match(muwatta.stderr, /numbering restarts per kitab/);
});

test("builder limit and checkpoint options are validated offline", () => {
  for (const [script, option] of [
    ["build-hadith-index.mjs", "--max-lookups=0"],
    ["build-hadith-index.mjs", "--timeout=0"],
    ["build-tafsir-index.mjs", "--max-pages=0"],
    ["build-tafsir-index.mjs", "--checkpoint-every=0"],
  ]) {
    const result = run(script, option, "--dry-run");
    assert.notEqual(result.status, 0);
  }
});

test("validate-index runs fully offline against the current committed data and passes", () => {
  const scratchDir = mkdtempSync(resolve(tmpdir(), "shamela-index-validation-"));
  try {
    const result = spawnSync(process.execPath, [resolve(root, "scripts", "validate-index.mjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, INDEX_VALIDATION_REPORT_DIR: scratchDir },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Validation passed/);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test("robots policy fails closed and honors longest matching rule", () => {
  assert.equal(robotsAllows("User-agent: *\nAllow: /\n", "/book/1"), true);
  assert.equal(robotsAllows("User-agent: *\nAllow: /\nDisallow: /ajax/\n", "/ajax/book"), false);
  assert.equal(robotsAllows("User-agent: Other\nAllow: /\n", "/book/1"), false);
});
