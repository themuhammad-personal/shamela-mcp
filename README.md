# shamela-mcp

An MCP (Model Context Protocol) server that exposes **[shamela.ws](https://shamela.ws)** — a large Arabic digital library of Islamic books — as a set of callable tools. Deployed as a Cloudflare Worker.

**Live endpoint:** `https://shamela-mcp.themuhammadpersonal.workers.dev/mcp`

## Tools

| Tool | Description |
|---|---|
| `get_categories` | Full category list with id / name / book_count |
| `get_books_by_category` | Paginated book list per category |
| `get_book_details` | Title, author, muhaqqiq, publisher, parts, TOC, `pagination_matches_print`, `hadith_numbering_service`, canonical-edition flag |
| `get_book_page` | Page text as **paragraphs + footnotes** (separated), volume / printed page, chapter path, prev/next, hadith numbers printed on the page, ayah refs |
| `search_books_by_name` | Ranked title autocomplete + canonical-edition flag per result (non-canonical editions point at the canonical `book_id`) |
| `search_library` | Native full-text search with any/all/exact, exclude, category, century filters, pagination. Results are `{title, author, url, snippet, book_id, page_id}`; `hadith_numbers` appears only when the static hadith index knows the page (`hadith_numbers_note` says so) |
| `get_author_books` | Author name plus their published books |
| `get_recently_added` | Homepage "recently added" list |
| `list_all_books` | Bulk multi-category book listing |
| `get_hadith_by_number` | **Hadith number → matn/isnad**, via shamela's own `رقم الحديث` lookup, verified on the page — no prebuilt index required. Adds `grading` when the page apparatus prints an explicit `[حكم الألباني] : …` / `قال الألباني: …` (Tirmidhi 1435, Abu Dawud 1726, Ibn Majah 1198, Nasa'i 829 editions); attributed only when unambiguous, otherwise `grading: null` + `gradings_on_page`. The compiler's own «حسن صحيح» is never reported as a grading |
| `get_tafsir_by_ayah` | **`surah:ayah` → tafsir passage** from the **persisted** tafsir index (`src/data/tafsir-index.mjs`: 114 surah page ranges for Ibn Kathir 8473 + known ayah → page). Unindexed ayahs are located by a bounded search (≤ 20 page reads) *inside the surah's range* — never a TOC walk at request time. Every answer carries `precision`: `exact` / `nearest_before` / `surah_start` (al-Fatiha, which Ibn Kathir quotes inline without `﴿…﴾` blocks) |
| `get_page_by_printed_number` | Printed `(volume, page)` → shamela page (`/ajax/pagenum2id`) |
| `list_canonical_editions` | The hand-verified canonical edition table (below) with provenance |

Every tool returns structured errors (`upstream_http` / `network` / `bad_request` / `internal`) with a hint, and never fabricates a number or page: a lookup that cannot be proven on the page returns `{ found: false, reason }`.

## Canonical editions (verified 2026-09-03)

shamela hosts several editions of each collection; only one per work carries the numbering cited worldwide. These ids were checked by hand against shamela's `/ajax/specialnumber2id` and the page text:

| Work | Canonical `book_id` | Numbering | Last # |
|---|---|---|---|
| صحيح البخاري | **1681** (ط السلطانية) | Fuad Abd al-Baqi | 7563 |
| صحيح مسلم | **1727** (ت عبد الباقي) | Fuad Abd al-Baqi — printed as `١ - (٨)`, cite the number in parentheses | 3033 |
| سنن أبي داود | **1726** (ت محيي الدين عبد الحميد) | Muhyi al-Din Abd al-Hamid | 5274 |
| سنن الترمذي | **1435** (ت شاكر) | Ahmad Shakir | 3956 |
| سنن النسائي | **829** (المجتبى ط المصرية) | Abu Ghuddah | 5758 |
| سنن ابن ماجه | **1198** (ت عبد الباقي) | Fuad Abd al-Baqi | 4341 |
| موطأ مالك | **1699** (رواية يحيى ت عبد الباقي) | numbers restart per كتاب — cite (kitab, number) | — |
| مسند أحمد | **25794** (ط الرسالة) | Risala / Arna'ut | 27647 |
| تفسير ابن كثير | **8473** (ت السلامة) | ayah-addressed, no hadith numbering | — |

`is_canonical_numbering` is **only** true for these ids. The محقق field is deliberately *not* used as evidence: Bukhari 1681's muhaqqiq is محمد زهير الناصر while its numbering is Abd al-Baqi's. Title matches yield `confidence: "title"` plus the canonical id to use instead.

## How it talks to shamela.ws

- `GET /ajax/book/?term=…` → title autocomplete (JSON)
- `GET /ajax/specialnumber2id/<book>/<n>` → page id for hadith `n` (plain text; `-1` if none; **clamps to last page for n > last**, hence on-page verification)
- `GET /ajax/pagenum2id/<book>/<part>/<page>` → page id for a printed page
- `POST /ajax/search` with `term`, `aqsam[]`, `decades[]`, `page` → HTML fragment
- Book pages: `div.nass > p` main text, `p.hamesh` footnotes, `#fld_part_top` volume, `#fld_goto_top` printed page, `div.size-12` chapter path (parser: `src/lib/page.mjs`, tested on a real page in `test/fixtures/`)

Politeness: per-isolate concurrency cap 4, 20 s timeout, 15-min response cache, in-flight de-duplication; index builder sleeps ≥250 ms between requests.

## Project layout

```
src/
  index.mjs                 Worker entry (fetch → MCP over Streamable HTTP, stateless)
  tools.mjs                 MCP tool registrations (registerTool) + handlers
  canonical-editions.mjs    whitelist lookup, work detection, derivative flag
  lib/
    shamela.mjs             scraping client (injectable fetch)
    page.mjs                book-page DOM parser
    citation-detect.mjs     hadith markers («N -», «N - (M)»), ayah refs, ﴿…(n)…﴾ markers, surah headings (all 8473 shapes), Albani gradings
    hadith-index.mjs        static indexes + live hadith resolver (specialnumber2id) + bounded in-range tafsir search
    arabic.mjs              normalize, title scoring, HTML helpers
    http.mjs                fetch + cache + concurrency cap + timeout
  data/
    canonical-book-ids.mjs  HAND-VERIFIED whitelist (with provenance and other editions)
    hadith-index.mjs        generated static hadith index (optional cache; empty seed)
    tafsir-index.mjs        persisted tafsir index: Ibn Kathir 8473 — 114 surah ranges (TOC + in-text headings for
                            al-Shu'ara/al-Ankabut which have no TOC entry) + hand-verified ayah → page seeds
scripts/
  resolve-canonical-editions.mjs   re-check the whitelist against live shamela (--list <title> to explore)
  build-hadith-index.mjs           build the static hadith index via specialnumber2id + on-page verification
  build-tafsir-index.mjs           walk a tafsir book once (offline) → surah ranges + every ayah's first page
  check-coverage.mjs               probe for absent subcontinental works → reports/
test/                              104 offline tests (node --test), incl. real-page fixture
.github/workflows/
  deploy.yml                Node 22, npm ci, tests, dry-run, deploy on push to main
  refresh-index.yml         manual/monthly: verify whitelist, coverage report, build index → PR
```

## Development

```bash
npm install
npm test                       # offline tests
npm run verify                 # tests + wrangler dry-run build
npm run dev                    # local wrangler dev
npm run deploy                 # deploy (needs CLOUDFLARE_API_TOKEN or wrangler login)
npm run resolve:canonical      # re-check canonical ids against live shamela.ws
node scripts/build-hadith-index.mjs --book 1681 --step=50 --dry-run   # smoke-run the hadith index builder
npm run build:tafsir -- --tafsir 8473 --delay=400                       # fill the tafsir index (~30 min, resumable with --from/--surah)
node scripts/check-coverage.mjs
```

Requires **Node ≥ 22** (wrangler 4.9x).

## Known data gaps

Some subcontinental Hanafi / Urdu-origin works (e.g. معارف القرآن, بيان القرآن, أحسن الفتاوى) are absent from shamela.ws's Arabic corpus (أحسن الفتاوى confirmed absent 2026-09-03). Tool descriptions say so explicitly: an empty result ≠ "the work doesn't exist".

## License

MIT — see [LICENSE](LICENSE).
