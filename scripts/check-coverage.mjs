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
 *   node scripts/check-coverage.mjs
 */

import { createHttp } from "../src/lib/http.mjs";
import { createClient } from "../src/lib/shamela.mjs";

const TITLES = [
  // Ma'arif al-Qur'an — Mufti Muhammad Shafi (Deobandi)
  "معارف القرآن",
  "معارف القران",
  // Bayan al-Qur'an — Ashraf Ali Thanwi
  "بيان القرآن",
  "بيان القران",
  // Ahsan al-Fatawa — Rashid Ahmad Ludhyanvi
  "أحسن الفتاوى",
  "احسن الفتاوى",
];

const http = createHttp();
const client = createClient({ text: http.text });

for (const title of TITLES) {
  const r = await client.titleSearch(title, 1, 5);
  const exact = r.results.filter((x) => x.match === "exact_normalized");
  console.log(`${title.padEnd(24)} → total ${r.total_available}, exact ${exact.length}`);
  if (exact.length) console.log(`    ${exact.map((x) => `${x.title} [${x.book_id}]`).join("; ")}`);
}
