import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { githubOutputs, planIndexSlice } from "../scripts/plan-index-slice.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, ".github/workflows/refresh-index.yml"), "utf8");

function position(text) {
  const index = workflow.indexOf(text);
  assert.notEqual(index, -1, `Missing workflow fragment: ${text}`);
  return index;
}

test("refresh workflow reserves live traffic for the authoritative bounded build", () => {
  assert.doesNotMatch(workflow, /run: npm run test:live/);
  assert.doesNotMatch(workflow, /run: node scripts\/resolve-canonical-editions\.mjs/);
  assert.match(workflow, /chunk_size:[\s\S]*?default: "100"/);
  assert.match(workflow, /from:[\s\S]*?default: ""/);
  assert.match(workflow, /run: node scripts\/plan-index-slice\.mjs >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /steps\.range\.outputs\.complete != 'true'/);
  assert.ok(position("Build bounded hadith index slice") < position("Validate generated index"));
  assert.ok(position("Validate generated index") < position("Open pull request"));
});

test("range planner bounds explicit slices and advances automatic slices", () => {
  const explicit = planIndexSlice({ BOOK: "1681", FROM: "201", TO: "", CHUNK_SIZE: "100", STEP: "1", TAFSIR: "", TAFSIR_FROM: "1", TAFSIR_TO: "1000" });
  assert.deepEqual({ from: explicit.from, to: explicit.to, lookups: explicit.lookups }, { from: 201, to: 300, lookups: 100 });
  const automatic = planIndexSlice({ BOOK: "1681", FROM: "", TO: "", CHUNK_SIZE: "100", STEP: "1", TAFSIR: "", TAFSIR_FROM: "1", TAFSIR_TO: "1000" });
  assert.equal(automatic.lookups > 0 && automatic.lookups <= 100, true);
  assert.match(githubOutputs(automatic), /^complete=(true|false)\nbook=1681\n/m);
  assert.throws(() => planIndexSlice({ BOOK: "1681", FROM: "1", TO: "1000", CHUNK_SIZE: "100", STEP: "1" }), /exceeds chunk_size/);
});

test("refresh workflow restores compatible checkpoints across commits", () => {
  assert.doesNotMatch(workflow, /citation-index-.*github\.sha/);
  assert.match(workflow, /restore-keys:[\s\S]*?citation-index-\$\{\{ steps\.range\.outputs\.hadith_scope \}\}-/);
  assert.match(workflow, /citation-index-\$\{\{ steps\.range\.outputs\.tafsir_scope \}\}-/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /hashFiles\('\.hadith-index\.checkpoint\.json'\)/);
  assert.match(workflow, /github\.run_id \}\}-\$\{\{ github\.run_attempt/);
});

test("builders clear checkpoints only after a successful completed slice", () => {
  for (const script of ["build-hadith-index.mjs", "build-tafsir-index.mjs"]) {
    const source = readFileSync(resolve(root, "scripts", script), "utf8");
    assert.match(source, /resetCheckpoint\(CHECKPOINT_PATH\)/);
    assert.ok(source.lastIndexOf("resetCheckpoint(CHECKPOINT_PATH)") > source.indexOf("writeFileSync("));
  }
});

test("package verification includes the deploy dry-run used by CI", () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.match(packageJson.scripts.verify, /npm test/);
  assert.match(packageJson.scripts.verify, /wrangler deploy --dry-run/);
});
