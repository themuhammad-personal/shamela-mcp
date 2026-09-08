import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import hadithIndex from "../src/data/hadith-index.mjs";
import canonicalBookIds from "../src/data/canonical-book-ids.mjs";
import { nextUncoveredRange } from "./lib/refresh-manifest.mjs";

function decimal(name, raw, { allowBlank = false, min = 0, max = 999_999_999 } = {}) {
  if (allowBlank && raw === "") return null;
  if (!/^(0|[1-9][0-9]{0,8})$/.test(raw ?? "")) throw new Error(`${name} must be a safe decimal integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

export function planIndexSlice(values = {}) {
  const book = decimal("BOOK", values.BOOK ?? "1681", { min: 1 });
  const requestedFrom = decimal("FROM", values.FROM ?? "", { allowBlank: true, min: 1 });
  const requestedTo = decimal("TO", values.TO ?? "", { allowBlank: true, min: 1 });
  const chunkSize = decimal("CHUNK_SIZE", values.CHUNK_SIZE ?? "100", { min: 1, max: 1000 });
  const step = decimal("STEP", values.STEP ?? "1", { min: 1 });
  const tafsir = decimal("TAFSIR", values.TAFSIR ?? "", { allowBlank: true, min: 1 });
  const tafsirFrom = decimal("TAFSIR_FROM", values.TAFSIR_FROM ?? "1", { min: 1 });
  const tafsirTo = decimal("TAFSIR_TO", values.TAFSIR_TO ?? "1000", { min: 1 });
  if (tafsirTo < tafsirFrom || tafsirTo - tafsirFrom + 1 > 1000) throw new Error("Invalid or oversized tafsir range");

  const edition = Object.values(canonicalBookIds.editions ?? {}).find((item) => Number(item.book_id) === book);
  const lastNumber = Number(edition?.last_number ?? 0) || null;
  let from = requestedFrom;
  let to = requestedTo;
  if (from === null) {
    if (step !== 1) throw new Error("Automatic range selection requires STEP=1");
    if (!lastNumber) throw new Error("FROM is required when the book has no canonical last_number");
    const next = nextUncoveredRange(lastNumber, chunkSize, hadithIndex.books?.[String(book)]?.covered_ranges);
    if (!next) {
      return { complete: true, book, from: lastNumber, to: lastNumber, step, lookups: 0, tafsir, tafsirFrom, tafsirTo };
    }
    ({ from, to } = next);
  } else {
    to ??= from + (chunkSize - 1) * step;
    if (lastNumber) to = Math.min(to, lastNumber);
  }
  if (to < from) throw new Error("Hadith end must be greater than or equal to start");
  const lookups = Math.floor((to - from) / step) + 1;
  if (lookups > chunkSize) throw new Error(`Requested ${lookups} lookups exceeds chunk_size=${chunkSize}`);
  return { complete: false, book, from, to, step, lookups, tafsir, tafsirFrom, tafsirTo };
}

export function githubOutputs(plan) {
  return [
    `complete=${plan.complete}`,
    `book=${plan.book}`,
    `from=${plan.from}`,
    `to=${plan.to}`,
    `step=${plan.step}`,
    `lookups=${plan.lookups}`,
    `hadith_scope=hadith-${plan.book}-${plan.from}-${plan.to}-${plan.step}`,
    `tafsir_scope=tafsir-${plan.tafsir ?? "none"}-${plan.tafsirFrom}-${plan.tafsirTo}`,
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${githubOutputs(planIndexSlice(process.env))}\n`);
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  }
}
