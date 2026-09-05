/**
 * Pure validation logic for the generated citation indexes (Roadmap
 * Priority 4). No file I/O and no network access — everything here is
 * synchronous and offline-testable. `scripts/validate-index.mjs` is the CLI
 * wrapper that loads the real data files and the git baseline, then calls
 * into this module.
 */

function countVerifiedHadith(bookEntry) {
  if (!bookEntry?.index) return { total: 0, verified: 0 };
  const numbers = Object.values(bookEntry.index);
  return {
    total: numbers.length,
    verified: numbers.filter((n) => n?.verified === true).length,
  };
}

export function countTafsirAyahs(bookEntry) {
  if (!bookEntry?.ayahs) return 0;
  return Object.keys(bookEntry.ayahs).length;
}

/**
 * @param {object} params
 * @param {object} params.hadithIndex   current `src/data/hadith-index.mjs` default export
 * @param {object} params.tafsirIndex   current `src/data/tafsir-index.mjs` default export
 * @param {object} params.canonicalEditions  `src/data/canonical-book-ids.mjs` default export
 * @param {number[]} params.ayahCounts  `AYAH_COUNTS` from citation-detect.mjs (index 1-114)
 * @param {object|null} params.baselineHadith  HEAD-committed hadith-index.mjs default export, or null
 * @param {object|null} params.baselineTafsir  HEAD-committed tafsir-index.mjs default export, or null
 */
export function validateIndexes({
  hadithIndex,
  tafsirIndex,
  canonicalEditions,
  ayahCounts,
  baselineHadith = null,
  baselineTafsir = null,
}) {
  const errors = [];
  const warnings = [];

  const byBookId = new Map();
  for (const edition of Object.values(canonicalEditions.editions ?? {})) {
    byBookId.set(edition.book_id, edition);
  }

  // -------------------------------------------------------------------
  // Hadith index: schema, canonical id, Muwatta exclusion, reverse
  // consistency, duplicate mapping
  // -------------------------------------------------------------------
  const hadithSummary = {};

  for (const [bookId, entry] of Object.entries(hadithIndex.books ?? {})) {
    hadithSummary[bookId] = { book_id: bookId };

    if (entry?.type !== "hadith") {
      errors.push(`hadith-index: book ${bookId} has type "${entry?.type}", expected "hadith"`);
      continue;
    }

    const canonical = byBookId.get(bookId);
    if (!canonical) {
      errors.push(`hadith-index: book ${bookId} is not in the hand-verified canonical whitelist (src/data/canonical-book-ids.mjs)`);
    } else if (canonical.type !== "hadith") {
      errors.push(`hadith-index: book ${bookId} is whitelisted as type "${canonical.type}", not "hadith"`);
    }

    if (canonical?.perKitabNumbering) {
      errors.push(
        `hadith-index: book ${bookId} (${canonical.title}) uses per-kitab numbering and must NEVER appear in the global hadith index — reject this entry (Muwatta rule).`,
      );
    }

    if (!entry.index || typeof entry.index !== "object") {
      errors.push(`hadith-index: book ${bookId} is missing an "index" object`);
      continue;
    }
    if (!entry.reverse || typeof entry.reverse !== "object") {
      errors.push(`hadith-index: book ${bookId} is missing a "reverse" object`);
      continue;
    }

    for (const [numberStr, rec] of Object.entries(entry.index)) {
      const number = Number(numberStr);
      if (!Number.isInteger(number) || number <= 0) {
        errors.push(`hadith-index: book ${bookId} has a non-positive-integer hadith number key "${numberStr}"`);
      }
      if (canonical?.last_number && number > canonical.last_number) {
        errors.push(`hadith-index: book ${bookId} number ${numberStr} exceeds the canonical last_number ${canonical.last_number}`);
      }
      if (typeof rec?.page !== "string" || rec.page.length === 0) {
        errors.push(`hadith-index: book ${bookId} number ${numberStr} has no valid "page"`);
        continue;
      }
      if (typeof rec.verified !== "boolean") {
        errors.push(`hadith-index: book ${bookId} number ${numberStr} is missing a boolean "verified" flag`);
      }

      const reverseList = entry.reverse[rec.page];
      if (!Array.isArray(reverseList) || !reverseList.includes(numberStr)) {
        errors.push(`hadith-index: book ${bookId} number ${numberStr} -> page ${rec.page} is missing from reverse[${rec.page}]`);
      }
    }

    for (const [page, numbers] of Object.entries(entry.reverse)) {
      if (!Array.isArray(numbers)) {
        errors.push(`hadith-index: book ${bookId} reverse[${page}] is not an array`);
        continue;
      }
      for (const numberStr of numbers) {
        if (entry.index[numberStr]?.page !== page) {
          errors.push(`hadith-index: book ${bookId} reverse[${page}] claims number ${numberStr}, but index[${numberStr}].page is "${entry.index[numberStr]?.page}"`);
        }
      }
      const unique = new Set(numbers);
      if (unique.size !== numbers.length) {
        errors.push(`hadith-index: book ${bookId} reverse[${page}] has duplicate hadith numbers`);
      }
    }

    const { total, verified } = countVerifiedHadith(entry);
    hadithSummary[bookId].total = total;
    hadithSummary[bookId].verified = verified;
    hadithSummary[bookId].unverified = total - verified;
  }

  // -------------------------------------------------------------------
  // Tafsir index: schema, canonical id, Quran boundary validation
  // -------------------------------------------------------------------
  const tafsirSummary = {};

  for (const [bookId, entry] of Object.entries(tafsirIndex.books ?? {})) {
    tafsirSummary[bookId] = { book_id: bookId };

    if (entry?.type !== "tafsir") {
      errors.push(`tafsir-index: book ${bookId} has type "${entry?.type}", expected "tafsir"`);
      continue;
    }

    const canonical = byBookId.get(bookId);
    if (!canonical) {
      errors.push(`tafsir-index: book ${bookId} is not in the hand-verified canonical whitelist (src/data/canonical-book-ids.mjs)`);
    } else if (canonical.type !== "tafsir") {
      errors.push(`tafsir-index: book ${bookId} is whitelisted as type "${canonical.type}", not "tafsir"`);
    }

    const surahs = entry.surahs ?? {};
    let surahsCovered = 0;
    for (const [surahStr, range] of Object.entries(surahs)) {
      const surah = Number(surahStr);
      if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
        errors.push(`tafsir-index: book ${bookId} has an out-of-bounds surah key "${surahStr}" (must be 1-114)`);
        continue;
      }
      const start = Number(range?.start);
      const end = Number(range?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        errors.push(`tafsir-index: book ${bookId} surah ${surah} has an invalid page range (start=${range?.start}, end=${range?.end})`);
      } else {
        surahsCovered += 1;
      }
    }

    const ayahs = entry.ayahs ?? {};
    let ayahsMapped = 0;
    for (const [key, page] of Object.entries(ayahs)) {
      const match = /^(\d+):(\d+)$/.exec(key);
      if (!match) {
        errors.push(`tafsir-index: book ${bookId} has a malformed ayah key "${key}" (expected "surah:ayah")`);
        continue;
      }
      const surah = Number(match[1]);
      const ayah = Number(match[2]);
      if (surah < 1 || surah > 114) {
        errors.push(`tafsir-index: book ${bookId} ayah key "${key}" has out-of-bounds surah (must be 1-114)`);
        continue;
      }
      const maxAyah = ayahCounts[surah] ?? 0;
      if (ayah < 1 || ayah > maxAyah) {
        errors.push(`tafsir-index: book ${bookId} ayah key "${key}" is outside canonical Quran bounds (surah ${surah} has ${maxAyah} ayahs)`);
        continue;
      }
      if (typeof page !== "string" || page.length === 0) {
        errors.push(`tafsir-index: book ${bookId} ayah key "${key}" has no valid page id`);
        continue;
      }
      ayahsMapped += 1;
    }

    tafsirSummary[bookId].surahs_covered = surahsCovered;
    tafsirSummary[bookId].ayahs_mapped = ayahsMapped;
  }

  // -------------------------------------------------------------------
  // Coverage-regression check against the supplied baseline
  // -------------------------------------------------------------------
  if (baselineHadith) {
    for (const [bookId, baseEntry] of Object.entries(baselineHadith.books ?? {})) {
      const { verified: baseVerified } = countVerifiedHadith(baseEntry);
      const nowVerified = hadithSummary[bookId]?.verified ?? 0;
      hadithSummary[bookId] ??= { book_id: bookId, total: 0, verified: 0, unverified: 0 };
      hadithSummary[bookId].previous_verified = baseVerified;
      hadithSummary[bookId].regression = nowVerified < baseVerified;
      if (nowVerified < baseVerified) {
        errors.push(`hadith-index: book ${bookId} verified-entry count dropped from ${baseVerified} to ${nowVerified} versus baseline — refusing to let a partial/failed run overwrite a better index`);
      }
    }
  } else {
    warnings.push("No baseline hadith-index.mjs supplied (first run, or not a git checkout) — regression check skipped.");
  }

  if (baselineTafsir) {
    for (const [bookId, baseEntry] of Object.entries(baselineTafsir.books ?? {})) {
      const baseAyahs = countTafsirAyahs(baseEntry);
      const nowAyahs = tafsirSummary[bookId]?.ayahs_mapped ?? 0;
      tafsirSummary[bookId] ??= { book_id: bookId, surahs_covered: 0, ayahs_mapped: 0 };
      tafsirSummary[bookId].previous_ayahs_mapped = baseAyahs;
      tafsirSummary[bookId].regression = nowAyahs < baseAyahs;
      if (nowAyahs < baseAyahs) {
        errors.push(`tafsir-index: book ${bookId} mapped-ayah count dropped from ${baseAyahs} to ${nowAyahs} versus baseline — refusing to let a partial/failed run overwrite a better index`);
      }
    }
  } else {
    warnings.push("No baseline tafsir-index.mjs supplied (first run, or not a git checkout) — regression check skipped.");
  }

  return {
    status: errors.length > 0 ? "failed" : "passed",
    hadith: hadithSummary,
    tafsir: tafsirSummary,
    errors,
    warnings,
  };
}
