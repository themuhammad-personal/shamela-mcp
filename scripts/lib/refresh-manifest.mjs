import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = resolve(__dirname, "../refresh-manifest.json");

export function loadManifest(path = MANIFEST_PATH) {
  const content = readFileSync(path, "utf8");
  const manifest = JSON.parse(content);
  validateManifestStructure(manifest);
  return manifest;
}

export function validateManifestStructure(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest must be an object");
  if (!Array.isArray(manifest.hadith_targets)) throw new Error("Manifest must have hadith_targets array");
  if (!Array.isArray(manifest.tafsir_targets)) throw new Error("Manifest must have tafsir_targets array");

  for (const t of manifest.hadith_targets) {
    if (!t.book_id || !/^\d+$/.test(t.book_id)) throw new Error(`Invalid hadith target book_id: ${t.book_id}`);
    if (t.status === "active" && (!t.last_number || typeof t.last_number !== "number")) {
      throw new Error(`Active hadith target ${t.book_id} requires numeric last_number`);
    }
  }

  for (const t of manifest.tafsir_targets) {
    if (!t.book_id || !/^\d+$/.test(t.book_id)) throw new Error(`Invalid tafsir target book_id: ${t.book_id}`);
    if (t.surah_count !== 114) throw new Error(`Tafsir target ${t.book_id} must have 114 surahs`);
  }
}

export function evaluateCoverage(manifest, hadithIndex, tafsirIndex) {
  const hadithCoverage = [];
  for (const target of manifest.hadith_targets) {
    if (target.status !== "active") {
      hadithCoverage.push({
        book_id: target.book_id,
        key: target.key,
        status: target.status,
        indexed_count: 0,
        total: target.last_number ?? 0,
        percent: 0,
        complete: false,
      });
      continue;
    }
    const bookData = hadithIndex?.books?.[target.book_id];
    const indexed = Object.keys(bookData?.index ?? {}).length;
    const total = target.last_number;
    hadithCoverage.push({
      book_id: target.book_id,
      key: target.key,
      status: target.status,
      indexed_count: indexed,
      total,
      percent: total ? Number(((indexed / total) * 100).toFixed(2)) : 0,
      complete: bookData?.coverage === "complete" || (indexed >= total && total > 0),
    });
  }

  const tafsirCoverage = [];
  for (const target of manifest.tafsir_targets) {
    const bookData = tafsirIndex?.books?.[target.book_id];
    const surahCount = Object.keys(bookData?.surahs ?? {}).length;
    const ayahCount = Object.keys(bookData?.ayahs ?? {}).length;
    tafsirCoverage.push({
      book_id: target.book_id,
      key: target.key,
      surah_count: surahCount,
      ayah_count: ayahCount,
      surahs_complete: surahCount === 114,
      last_page: target.last_page,
    });
  }

  return { hadith: hadithCoverage, tafsir: tafsirCoverage };
}
