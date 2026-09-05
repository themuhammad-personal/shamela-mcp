#!/usr/bin/env node
/**
 * Manifest-driven refresh orchestrator for shamela-mcp citation indexing.
 *
 * Usage:
 *   node scripts/orchestrate-refresh.mjs [--mode=all|hadith|tafsir] [--book=id] [--tafsir=id] [--dry-run]
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import hadithIndex from "../src/data/hadith-index.mjs";
import tafsirIndex from "../src/data/tafsir-index.mjs";
import { loadManifest, evaluateCoverage } from "./lib/refresh-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const rawOpt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const MODE = rawOpt("mode") || "all";
const TARGET_BOOK = rawOpt("book");
const TARGET_TAFSIR = rawOpt("tafsir");

const manifest = loadManifest();
const coverage = evaluateCoverage(manifest, hadithIndex, tafsirIndex);

console.log("=== Shamela MCP Index Refresh Orchestrator ===");
console.log(`Manifest loaded: ${manifest.hadith_targets.length} hadith targets, ${manifest.tafsir_targets.length} tafsir targets.\n`);

console.log("Hadith Index Coverage:");
for (const h of coverage.hadith) {
  console.log(`  [${h.book_id}] ${h.key}: ${h.indexed_count}/${h.total} (${h.percent}%) - Status: ${h.status}`);
}

console.log("\nTafsir Index Coverage:");
for (const t of coverage.tafsir) {
  console.log(`  [${t.book_id}] ${t.key}: ${t.surah_count}/114 surahs, ${t.ayah_count} ayahs - Max page: ${t.last_page}`);
}

if (DRY_RUN) {
  console.log("\n--dry-run specified. Planned operations:");
  if (MODE === "all" || MODE === "hadith") {
    const targets = TARGET_BOOK
      ? manifest.hadith_targets.filter((t) => t.book_id === TARGET_BOOK)
      : manifest.hadith_targets.filter((t) => t.status === "active");
    for (const t of targets) {
      console.log(`  - Would crawl hadith book ${t.book_id} (${t.key}) with chunk size ${t.chunk_size}`);
    }
  }
  if (MODE === "all" || MODE === "tafsir") {
    const targets = TARGET_TAFSIR
      ? manifest.tafsir_targets.filter((t) => t.book_id === TARGET_TAFSIR)
      : manifest.tafsir_targets;
    for (const t of targets) {
      console.log(`  - Would crawl tafsir book ${t.book_id} (${t.key}) with chunk pages ${t.chunk_pages}`);
    }
  }
  process.exit(0);
}

// Execution mode
let failureCount = 0;

if (MODE === "all" || MODE === "hadith") {
  const targets = TARGET_BOOK
    ? manifest.hadith_targets.filter((t) => t.book_id === TARGET_BOOK)
    : manifest.hadith_targets.filter((t) => t.status === "active");

  for (const t of targets) {
    console.log(`\n>>> Running hadith crawler for ${t.key} (${t.book_id})...`);
    const cmdArgs = [
      resolve(__dirname, "build-hadith-index.mjs"),
      `--book=${t.book_id}`,
      `--from=1`,
      `--to=${Math.min(t.last_number, t.chunk_size)}`,
      "--resume",
    ];
    const res = spawnSync(process.execPath, cmdArgs, { cwd: rootDir, stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`✖ Hadith crawler failed for ${t.key} (exit code ${res.status})`);
      failureCount += 1;
    }
  }
}

if (MODE === "all" || MODE === "tafsir") {
  const targets = TARGET_TAFSIR
    ? manifest.tafsir_targets.filter((t) => t.book_id === TARGET_TAFSIR)
    : manifest.tafsir_targets;

  for (const t of targets) {
    console.log(`\n>>> Running tafsir crawler for ${t.key} (${t.book_id})...`);
    const cmdArgs = [
      resolve(__dirname, "build-tafsir-index.mjs"),
      `--tafsir=${t.book_id}`,
      "--from=1",
      `--to=${t.chunk_pages}`,
      "--resume",
    ];
    const res = spawnSync(process.execPath, cmdArgs, { cwd: rootDir, stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`✖ Tafsir crawler failed for ${t.key} (exit code ${res.status})`);
      failureCount += 1;
    }
  }
}

if (failureCount > 0) {
  console.error(`\n✖ Orchestration completed with ${failureCount} failure(s).`);
  process.exit(1);
}

console.log("\n✔ Orchestration complete.");
