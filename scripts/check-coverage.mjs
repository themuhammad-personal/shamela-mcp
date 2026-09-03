/**
 * Coverage-gap probe (Roadmap Phase 1.2 / Priority 5).
 *
 * Verifies whether subcontinental Hanafi / Urdu-origin works that are commonly
 * cited (often under Arabic titles) exist in shamela.ws at all. If they are
 * absent, that is an *upstream data gap* (shamela's Arabic-only corpus), not
 * something the connector can fix — surface it as a known limitation rather
 * than silently dropping it.
 *
 * Run where network is available:
 *   npm run check:coverage
 *
 * Writes a durable record (so the finding survives the run) to:
 *   reports/coverage.json
 *   reports/coverage.md
 * The `Refresh citation index` workflow commits these back, which is what makes
 * the gap check reproducible without a local machine.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(__dirname, "../reports");

const TITLES = [
  // Ma'arif al-Qur'an — Mufti Muhammad Shafi (Deobandi)
  { title: "معارف القرآن", alt: "معارف القران", work: "Ma'arif al-Qur'an", author: "Mufti Muhammad Shafi" },
  // Bayan al-Qur'an — Ashraf Ali Thanwi
  { title: "بيان القرآن", alt: "بيان القران", work: "Bayan al-Qur'an", author: "Ashraf Ali Thanwi" },
  // Ahsan al-Fatawa — Rashid Ahmad Ludhyanvi
  { title: "أحسن الفتاوى", alt: "احسن الفتاوى", work: "Ahsan al-Fatawa", author: "Rashid Ahmad Ludhyanvi" },
];

const http = createHttp();
const client = createClient({ text: http.text });

const rows = [];

for (const entry of TITLES) {
  for (const title of [entry.title, entry.alt]) {
    let r;
    try {
      r = await client.titleSearch(title, 1, 10);
    } catch (e) {
      rows.push({ ...entry, queried: title, error: e.message });
      console.log(`${title.padEnd(24)} → ERROR ${e.message}`);
      continue;
    }
    const exact = r.results.filter((x) => x.match === "exact_normalized");
    rows.push({
      ...entry,
      queried: title,
      total_available: r.total_available,
      exact: exact.map((x) => ({ book_id: x.book_id, title: x.title })),
      top: r.results.slice(0, 3).map((x) => ({ book_id: x.book_id, title: x.title, match: x.match })),
    });
    console.log(`${title.padEnd(24)} → total ${r.total_available}, exact ${exact.length}`);
    if (exact.length) console.log(`    ${exact.map((x) => `${x.title} [${x.book_id}]`).join("; ")}`);
  }
}

const byWork = new Map();
for (const row of rows) {
  const prev = byWork.get(row.work) ?? { work: row.work, author: row.author, found: [], queries: [] };
  prev.queries.push({ title: row.queried, exact: row.exact?.length ?? 0, total: row.total_available ?? 0, error: row.error ?? null });
  prev.found.push(...(row.exact ?? []));
  byWork.set(row.work, prev);
}
const summary = [...byWork.values()].map((w) => ({ ...w, present: w.found.length > 0 }));

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(resolve(REPORT_DIR, "coverage.json"), JSON.stringify({ generated_at: new Date().toISOString(), works: summary }, null, 2));

const md = [
  "# Shamela.ws coverage report — subcontinental Hanafi / Urdu-origin works",
  "",
  `Generated \`${new Date().toISOString()}\` by \`scripts/check-coverage.mjs\` (Roadmap Phase 1.2 / Priority 5).`,
  "",
  "| Work | Author | Present in shamela.ws | Exact title hits |",
  "|---|---|---|---|",
  ...summary.map((w) =>
    `| ${w.work} | ${w.author} | ${w.present ? "✅ yes" : "❌ **not found**"} | ${w.found.length} |`,
  ),
  "",
  "## Interpretation",
  "",
  "A ❌ here means *shamela.ws's Arabic corpus does not index this work under this",
  "title* — an upstream data gap, not a bug in this connector. It does **not** mean",
  "the work does not exist. `search_books_by_name` documents this explicitly so a",
  "caller never concludes \"the book is fictional\" from an empty result set.",
  "",
  "### Queries run",
  "",
  ...summary.flatMap((w) => [
    `**${w.work}**`,
    ...w.queries.map((q) => `- \`${q.title}\` → ${q.error ? `error: ${q.error}` : `${q.total} total, ${q.exact} exact`}`),
    "",
  ]),
];
writeFileSync(resolve(REPORT_DIR, "coverage.md"), md.join("\n"));
console.log(`\n✔ Wrote ${resolve(REPORT_DIR, "coverage.json")} and coverage.md`);
console.log(`Present: ${summary.filter((w) => w.present).length}/${summary.length} works found.`);
