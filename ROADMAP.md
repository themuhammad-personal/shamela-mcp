# Shamela MCP — Upgrade Roadmap

A merged, phase-based plan to turn the existing `shamela-mcp` connector from a
*browser* of `shamela.ws` into a *citation-addressable* research tool for an
Islamic-studies assistant (khutbah prep, fatwa research, comparative fiqh —
Hanafi-priority, four-madhhab comparison).

## Progress tracker

Status as of **2026-09-03** (audited against live shamela.ws, not against the
previous agent's claims).

| Phase | Status |
|---|---|
| 0.1 reconstruct source | ✅ done — `src/index.mjs` + `src/lib/*.mjs` + `src/tools.mjs`; legacy 783 KB `src/worker.mjs` deleted |
| 0.2 test harness | ✅ done — `node --test`, 78 offline tests incl. a **real shamela page fixture** (`test/fixtures/`) |
| 0.3 storage decision | ✅ static data files (`src/data/*.mjs`) + live fallback; KV not needed yet |
| 0.4 rate limiting | 🟡 upstream side done (per-isolate concurrency cap 4, 20 s timeout, 15-min cache, in-flight de-dupe, builder delay ≥250 ms). **Public `/mcp` endpoint still has no per-caller limit/auth.** |
| 0.5 ToS/copyright note | ⏳ pending |
| 0.6 CI/CD | ✅ **fixed** — deploy was broken since PR #1 (wrangler 4.128 needs Node ≥22; workflow used Node 20). Now Node 22 + `npm ci` + tests + dry-run before deploy |
| 1.1 canonical editions | ✅ **hand-verified whitelist** of 9 book_ids (see `src/data/canonical-book-ids.mjs`), each checked against `/ajax/specialnumber2id`. The old محقق-name heuristic was wrong on real data (false negative on Bukhari 1681) and is gone. `list_canonical_editions` tool added |
| 1.2 coverage gap (P5) | 🟡 script exists; `reports/` not yet generated (needs a network run — see workflow) |
| 1.3 filter docs | ✅ done |
| 2.1 `get_hadith_by_number` | ✅ **works without any prebuilt index** — uses shamela's own `رقم الحديث` lookup (`/ajax/specialnumber2id`) then verifies the «N -» marker on the fetched page; continues across page breaks; refuses out-of-range numbers; never guesses |
| 2.2 reverse page→hadith | ✅ `hadith_numbers` on `get_book_page` now come from **on-page markers** (footnotes excluded), static index only as fallback |
| 2.3 inline hadith numbers | 🟡 `search_library` hits carry `hadith_numbers` only when the static index has the page (index still empty) |
| 2.4 `get_tafsir_by_ayah` | ✅ live TOC walk («تفسير سورة X» → pages → «﴿…(n)…﴾» markers), bounded; static index as cache. Ibn Kathir 8473 verified |
| 2.5 deep-link snippets | 🟡 same dependency as 2.3 |
| 2.6 printed page lookup | ✅ new `get_page_by_printed_number` (`/ajax/pagenum2id`) |
| 3.x metadata / tarjamah | ⏳ pending (`/ajax/tarjama/<narrator_id>` endpoint identified) |
| 4.x reading UX | ⏳ pending |

### Where the network-dependent scripts run

`resolve:canonical` (now a **re-check** of the hand-verified whitelist),
`build:index` and `check:coverage` need real access to `shamela.ws`. The
**`Refresh citation index`** workflow (`.github/workflows/refresh-index.yml`,
manual + monthly) runs them on a GitHub runner and opens a PR with
`src/data/hadith-index.mjs` + `reports/*`. The Worker does not depend on it —
the static index only makes lookups cheaper.

### Verified shamela.ws facts (2026-09-03)

- `GET /ajax/specialnumber2id/<book>/<n>` → page id; `-1` when the book has no
  numbering; **clamps to the last page for n > last** (so on-page verification
  is mandatory). Verified on 1681, 1727, 1726, 1435, 829, 1198, 1699, 25794.
- Page DOM: `div.nass > p` (main), `p.hamesh` (footnotes), `#fld_part_top`
  (volume), `#fld_goto_top` (printed page), `div.size-12 span.text-black`
  (chapter path), nav `>`/`>>` links.
- Muslim (1727) prints `١ - (٨) …` — the citable number is in parentheses.
- Muwatta (1699) restarts numbering per كتاب; shamela's lookup returns the
  *last* kitab's match for small numbers.

> **Audience & language.** The end-user is a practicing `alim` who will catch a
> wrong citation. Every feature here is judged against one question: *can the
> scholar cite this — book, chapter, hadith number, edition — with confidence?*
>
> **Budget constraint.** Everything below runs on free tiers (Cloudflare
> Workers + KV/R2/D1 free limits, GitHub). No purchases, no paid database.

---

## 0. Design benchmark (what "good" feels like)

| Reference | What it does well | What Shamela should copy |
|---|---|---|
| **sunnah.com API** | Hadith addressed by `(collection, bookNumber, hadithNumber)` | Hadith-number-addressable retrieval (Priority 1) |
| **dorar.net / dorar-hadith-mcp** | Grading + who graded it + narrator + sharh / alternate narrations | Structured grading, attributed to a named muhaqqiq (Priority 4) |
| **quran.ai** | `surah:ayah` retrieval, edition list with descriptions, grounding discipline in tool descriptions | Ayah-addressable tafsir + edition choice + citation discipline (Priority 2, 3, 6) |

Use these as **ergonomics references only** — never copy their data
(licensing/attribution differs per source).

---

## 1. What already works (do not regress)

- Category taxonomy (full classical-corpus depth: hadith books, Hanafi fiqh, tafsir, tarajim…).
- `search_library` full-text search: `match_mode` (any/all/exact), `exclude_words`, `categories`, `century` filters, pagination.
- Arabic normalization + title scoring (`شرح/حاشية` penalty) — this is correct and must be preserved.
- Multi-edition awareness (e.g. multiple editions of Sahih Bukhari indexed separately).

---

## 2. Phases

### Phase 0 — Foundation (dependency for everything else)

**Why first:** priorities 1–2 need an index/cache and a real storage story;
the current source is a single generated bundle, which cannot host that work safely.

| # | Task | Notes |
|---|---|---|
| 0.1 | Reconstruct multi-file source from the bundle (`src/worker.mjs` → `src/*.js`) | The bundle was built from a TS source (`src/index.ts`) that is not in the repo. Split it into modules. |
| 0.2 | Test harness with saved-HTML fixtures | Scrape once into fixtures; run deterministic tests offline. `node --test`. |
| 0.3 | **Decide index storage + ingestion** | See "Storage decision" below. This is the single biggest architectural risk. |
| 0.4 | Rate limiting / optional auth on the public endpoint | Protect shamela.ws from being hammered through this proxy. |
| 0.5 | Record position on shamela.ws ToS + copyright of muhaqqaq texts | Document; keep attribution. |

**Storage decision (0.3).** The plan says "scrape once, store, don't re-derive
per request." A Cloudflare Worker cannot crawl the corpus inside a request
(CPU limits). Options, in order of preference:

1. **Static data files in the bundle** (start here) — for the first ~30
   high-traffic reference works, the `hadith_number → page_id` index is small
   enough to ship as JSON in the deploy. Zero new infrastructure.
2. **Cloudflare KV** — free, key-value; good for read-heavy index lookups
   (`book:{id}:hadith:{n}`, `book:{id}:page:{p}`).
3. **R2 (object store)** — for larger per-book indexes / full TOC snapshots.
4. **D1 (SQLite)** — only if we later need range queries across books.

Ingestion runs as a **separate job** (GitHub Actions cron or a `wrangler`
scheduled worker), never inline in a tool call.

---

### Phase 1 — Cheap, high-correctness wins (do first)

| # | Task | Impact | Feasibility |
|---|---|---|---|
| 1.1 | **Canonical-edition whitelist → `is_canonical_numbering`** (Priority 3) | ⭐⭐⭐ | High (curated table) |
| 1.2 | **Coverage-gap investigation: Subcontinental Hanafi/Urdu-origin works** (Priority 5) — `معارف القرآن`, `بيان القرآن`, `أحسن الفتاوى`… | ⭐⭐ | High (search + document) |
| 1.3 | Document `century` param mapping (`decades[]`; `-2` = pre-Islamic) and `exclude_words` post-filter limitation in tool descriptions | ⭐ | High (docs only) |

**1.1 rationale.** Quoting "Bukhari #8" from the wrong edition is worse than
not citing at all. Ship a curated table of which indexed edition uses the
globally-standard numbering (e.g. Fuad Abd al-Baqi for Bukhari/Muslim, Ahmad
Shakir for Tirmidhi/Musnad, Muhyi al-Din Abd al-Hamid for Abu Dawud…). Tag
results so the model never has to guess among 5 Bukhari editions.

> **Status: wired.** See `src/canonical-editions.mjs` (data + detector),
> `src/data/canonical-book-ids.mjs` (the resolved map the detector reads),
> `scripts/resolve-canonical-editions.mjs` (writes that map from live data),
> `test/canonical-editions.test.mjs` (unit tests).
>
> The remaining gap is purely "nobody has run the resolver somewhere with
> network access yet" — the `Refresh citation index` workflow closes it without
> a local machine.

---

### Phase 2 — Citation-addressable core (the heavy lift)

| # | Task | Notes |
|---|---|---|
| 2.1 | **`get_hadith_by_number(book_id, hadith_number)`** (Priority 1) | Resolves a canonical hadith number → page/node in a given edition; returns matn (+isnad if present). Backed by the Phase 0 index, **not** a live TOC walk. |
| 2.2 | **Reverse lookup: page → hadith number(s)** (Priority 1) | So any result can self-report its citation. |
| 2.3 | **Inject hadith number inline** into every hadith-bearing output (Priority 1) | Not just the page number. |
| 2.4 | **`get_tafsir_by_ayah(surah, ayah, book_id)`** (Priority 2) | Return the passage discussing an ayah from a Shamela tafsir (Ibn Kathir, Qurtubi, Tabari, Baghawi, Ruh al-Ma'ani…). This is what makes Shamela *additive* to quran.ai. |
| 2.5 | **Deep-linkable search snippets** (Priority 6) | `search_library` hits carry resolved `hadith_number` / `ayah` alongside the page. |

**Known hard parts (flag as limitations, don't paper over):**
- Shamela's HTML does **not** mark hadith numbers uniformly: some editions put
  the number in a heading, some inline in Arabic numerals, some not at all.
  → The index will be **partially curated per edition**, not fully automatic.
- Tafsir ayah-mapping needs start/end heuristics (a mufassir discusses an ayah
  across multiple places); "main passage" detection is approximate.
- If a source page carries no number, return `null` — **never infer/fabricate**.

---

### Phase 3 — Scholarly metadata

| # | Task | Notes |
|---|---|---|
| 3.1 | **Hadith grading metadata, attributed** (Priority 4) | Only surface grading a *named* muhaqqiq asserted in the source (e.g. `ت الألباني` prints). v1: return footnote/hashiya text; v2: structured. Never algorithmic grading. |
| 3.2 | Enrich edition metadata | Muhaqqiq, tahqiq type, print/edition, year — beyond the current publisher/edition/page-count. |
| 3.3 | **Author tarjamah (biography) tool** | Birth/death year, teachers, students, madhhab, reliability. |

---

### Phase 4 — Reading & research experience (own additions)

| # | Task |
|---|---|
| 4.1 | Hierarchical (volume → part → chapter) table of contents |
| 4.2 | Search *within* a book |
| 4.3 | Page-range / sequential page reads |
| 4.4 | Edition comparison (same book, different tahqiq side by side) |
| 4.5 | Stable citation URI for every retrievable unit (book / chapter / hadith / ayah) |

---

## 3. Non-goals / guardrails (binding)

- No general web scraper beyond shamela.ws's own page structure.
- **Never fabricate** hadith numbers, grading, or ayah references — return
  `null`/absent when the source lacks them.
- Don't merge sunnah.com / dorar.net data directly (use as design reference only).
- Don't regress the existing search + Arabic-normalization behavior.
- Flag "the source doesn't support this cleanly" as a **known limitation** in
  tool descriptions, never a silent gap (see Priority 5).

---

## 4. Sequencing summary

```
Phase 0 (foundation) ─▶ Phase 1 (cheap wins) ─▶ Phase 2 (citation core)
                                                ─▶ Phase 3 (metadata)
                                                ─▶ Phase 4 (reading UX)
```

Start: **1.1** (canonical editions) and **1.2** (coverage gap) in parallel,
while **0.1–0.3** (source split + storage decision) unblocks Phase 2.
