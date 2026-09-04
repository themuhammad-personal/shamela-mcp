import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
