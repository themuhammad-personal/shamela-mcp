/**
 * Offline validation gate for the generated citation indexes (Roadmap
 * Priority 4). Runs after `build-hadith-index.mjs` / `build-tafsir-index.mjs`
 * and before the generated data is committed or opened as a pull request.
 *
 * Pure checks (schema, canonical id, Muwatta exclusion, reverse-index
 * consistency, Quran boundary validation, coverage regression versus the
 * version committed at git HEAD) live in `scripts/lib/index-validation.mjs`
 * and are covered by offline unit tests with synthetic data. This file only
 * loads the real files (current + HEAD baseline) and reports the result —
 * no network access.
 *
 * Exit code is non-zero on any error. Warnings do not fail the run but are
 * always included in the report so a partial run is visible to reviewers.
 *
 * Writes a report (citation/location metadata + counts only, never book
 * text) to:
 *   reports/index-validation.json
 *   reports/index-validation.md
 *
 * Usage:
 *   node scripts/validate-index.mjs
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import canonicalEditions from "../src/data/canonical-book-ids.mjs";
import hadithIndex from "../src/data/hadith-index.mjs";
import tafsirIndex from "../src/data/tafsir-index.mjs";
import { AYAH_COUNTS } from "../src/lib/citation-detect.mjs";
import { validateIndexes } from "./lib/index-validation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// Overridable so offline tests can point this at a scratch directory instead
// of writing into the tracked reports/ folder on every `npm test` run.
const REPORT_DIR = process.env.INDEX_VALIDATION_REPORT_DIR
  ? resolve(process.env.INDEX_VALIDATION_REPORT_DIR)
  : resolve(ROOT, "reports");

/** Load the HEAD-committed version of a generated data file, or null if it
 * cannot be read (e.g. first run, no git, or file did not exist at HEAD). */
async function loadBaseline(relPath) {
  let raw;
  try {
    raw = execFileSync("git", ["show", `HEAD:${relPath}`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    return null;
  }
  const tmp = resolve(ROOT, `.validate-baseline-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, raw);
  try {
    const mod = await import(`file://${tmp}`);
    return mod.default;
  } finally {
    rmSync(tmp, { force: true });
  }
}

const [baselineHadith, baselineTafsir] = await Promise.all([
  loadBaseline("src/data/hadith-index.mjs"),
  loadBaseline("src/data/tafsir-index.mjs"),
]);

const report = validateIndexes({
  hadithIndex,
  tafsirIndex,
  canonicalEditions,
  ayahCounts: AYAH_COUNTS,
  baselineHadith,
  baselineTafsir,
});
report.generated_at = new Date().toISOString();

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(resolve(REPORT_DIR, "index-validation.json"), JSON.stringify(report, null, 2));

const md = [
  "# Citation index validation report",
  "",
  `Generated \`${report.generated_at}\` by \`scripts/validate-index.mjs\`.`,
  "",
  `**Status:** ${report.status === "passed" ? "✅ passed" : "❌ FAILED"}`,
  "",
  "## Hadith index",
  "",
  "| book_id | total | verified | unverified | previous verified | regression |",
  "|---|---|---|---|---|---|",
  ...Object.values(report.hadith).map(
    (s) => `| ${s.book_id} | ${s.total ?? 0} | ${s.verified ?? 0} | ${s.unverified ?? 0} | ${s.previous_verified ?? "n/a"} | ${s.regression ? "⚠️ yes" : "no"} |`,
  ),
  "",
  "## Tafsir index",
  "",
  "| book_id | surahs covered | ayahs mapped | previous ayahs mapped | regression |",
  "|---|---|---|---|---|",
  ...Object.values(report.tafsir).map(
    (s) => `| ${s.book_id} | ${s.surahs_covered ?? 0} | ${s.ayahs_mapped ?? 0} | ${s.previous_ayahs_mapped ?? "n/a"} | ${s.regression ? "⚠️ yes" : "no"} |`,
  ),
  "",
  "## Errors",
  "",
  report.errors.length ? report.errors.map((e) => `- ${e}`).join("\n") : "_none_",
  "",
  "## Warnings",
  "",
  report.warnings.length ? report.warnings.map((w) => `- ${w}`).join("\n") : "_none_",
];
writeFileSync(resolve(REPORT_DIR, "index-validation.md"), md.join("\n"));

console.log(`\n${report.status === "passed" ? "✔" : "✘"} Validation ${report.status}. Wrote ${resolve(REPORT_DIR, "index-validation.json")} and .md`);
if (report.errors.length) {
  console.error(`\n${report.errors.length} error(s):`);
  for (const e of report.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (report.warnings.length) {
  console.warn(`\n${report.warnings.length} warning(s):`);
  for (const w of report.warnings) console.warn(`  - ${w}`);
}
