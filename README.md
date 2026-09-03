# shamela-mcp

An MCP (Model Context Protocol) server that exposes **[shamela.ws](https://shamela.ws)** — a large Arabic digital library of Islamic books — as a set of callable tools. Deployed as a Cloudflare Worker.

**Live endpoint:** `https://shamela-mcp.themuhammadpersonal.workers.dev/mcp`

## Tools

| Tool | Description |
|---|---|
| `get_categories` | Full category list with id / name / book_count |
| `get_books_by_category` | Paginated book list per category |
| `get_book_details` | Title, author, muhaqqiq, full table of contents, metadata, canonical-edition flag |
| `get_book_page` | Arabic page text + hadith numbers on that page (reverse lookup) |
| `search_books_by_name` | Ranked title autocomplete + canonical-edition flag per result |
| `search_library` | Native full-text search with any/all/exact, exclude, category, century filters, pagination, deep-link hadith numbers |
| `get_author_books` | Author name plus their published books |
| `get_recently_added` | Homepage "recently added" list |
| `list_all_books` | Bulk multi-category book listing |
| `get_hadith_by_number` | Resolve a canonical hadith number → page + matn (citation-addressable) |
| `get_tafsir_by_ayah` | Resolve `surah:ayah` → tafsir passage (citation-addressable) |

> `get_hadith_by_number` and `get_tafsir_by_ayah` depend on a **citation index**
> built by `scripts/build-hadith-index.mjs` (requires network). Until that index
> is built, they return `{ found: false, reason: ... }` — they never fabricate a
> number/page. See "Citation index" below.

## Project layout (reconstructed source)

`src/worker.mjs` was previously a single 783 KB generated bundle. The source has
now been reconstructed and split into testable modules:

```
src/
  index.mjs                 Cloudflare Worker entry (fetch → MCP over Streamable HTTP)
  tools.mjs                 MCP tool definitions + handlers (only module importing the SDK + zod)
  canonical-editions.mjs    which edition of a work uses standard numbering (Priority 3)
  lib/
    shamela.mjs             shamela.ws scraping (injectable fetch → offline-testable)
    arabic.mjs              pure Arabic/HTML helpers (normalize, title scoring, …)
    http.mjs                fetch + TTL cache wrapper
    hadith-index.mjs        citation-index resolver (hadith/tafsir lookups)
  data/
    hadith-index.mjs        generated citation index (seed is empty until built)
scripts/
  resolve-canonical-editions.mjs   resolve live book_ids for canonical editions (needs network)
  build-hadith-index.mjs           build the citation index (needs network)
  check-coverage.mjs               probe for absent subcontinental Hanafi/Urdu works
test/
  *.test.mjs                offline unit + integration tests (node --test)
```

`wrangler.jsonc` now points `main` at `src/index.mjs`; `wrangler` bundles the
`zod` + `@modelcontextprotocol/sdk` dependencies at deploy time. The old
`src/worker.mjs` is kept as the last-known-good deployed artifact and can be
deleted after the next successful deploy is verified.

## How it talks to shamela.ws

- `GET /ajax/book/?term=...` → title autocomplete (JSON)
- `GET /ajax/authors/?term=...` → author autocomplete (JSON)
- `POST /ajax/search` with `term`, `aqsam[]` (category ids), `decades[]` (Hijri century, `-2` = pre-Islamic), `page` → HTML result fragment
- Category / author / book pages are scraped from server-rendered HTML

Note: shamela's own `-word` exclude operator is unreliable (it broadens results instead of narrowing), so `exclude_words` is applied as a post-filter on returned snippets instead of relying on the site's operator. The `century` filter is Hijri (`decades[]`); `-2` = pre-Islamic.

## Canonical edition metadata (Priority 3)

shamela.ws indexes several editions of the same classical work, but only one per
work uses the globally-standard hadith numbering cited worldwide (Fuad Abd
al-Baqi for Bukhari/Muslim/Ibn Majah, Ahmad Shakir for Tirmidhi/Musnad, Muhyi
al-Din Abd al-Hamid for Abu Dawud, Abu Ghuddah for Nasa'i). Tools tag that
edition so the model never guesses among editions:

- `src/canonical-editions.mjs` — the scholarly facts + detector. Discipline:
  a **muhaqqiq match** is authoritative (`is_canonical_numbering: true`); a
  **title-only match** is unconfirmed (`false`, edition hint kept); a
  **different muhaqqiq** means "not canonical".
- `scripts/resolve-canonical-editions.mjs` — resolves the live shamela.ws
  `book_id`s into `CANONICAL_BOOK_IDS` (requires network).

> ⚠️ The exact shamela.ws `book_id`s are **pending live verification** (this
> repo's build sandbox has no network). Run `npm run resolve:canonical` where
> network is available before the `verified` confidence level becomes active.

## Citation index (Priorities 1, 2, 6)

`scripts/build-hadith-index.mjs` walks each book's pages once and writes a
forward + reverse index (`hadith_number ⇄ page`, and `surah:ayah → page` for
tafsir) into `src/data/hadith-index.mjs`. Lookups are then O(1) map hits — no
live TOC walk per request.

**Known limitations (flagged, not hidden):**

- shamela.ws does **not** mark hadith numbers uniformly across editions. The
  builder's number detection is best-effort and must be tuned per edition;
  where no number is reliably detectable, the entry is omitted (never invented).
- Tafsir "main passage" for an ayah is approximate (a mufassir discusses an ayah
  in several places); the builder records the first strong match.

## Development

```bash
npm install
npm test                    # offline unit + integration tests
npm run dev                 # local dev via wrangler
npm run deploy              # deploy to Cloudflare
npm run resolve:canonical   # populate canonical book_ids (needs network)
node scripts/build-hadith-index.mjs   # build citation index (needs network)
node scripts/check-coverage.mjs       # probe coverage gaps (needs network)
```

Requires a Cloudflare account and `wrangler login`, or a `CLOUDFLARE_API_TOKEN`
in the environment.

## Known data gaps (Priority 5)

Some subcontinental Hanafi / Urdu-origin works commonly cited in the
subcontinent may be absent from shamela.ws's Arabic-only corpus (e.g.
Ma'arif al-Qur'an / معارف القرآن, Bayan al-Qur'an / بيان القرآن, Ahsan
al-Fatawa / أحسن الفتاوى). `scripts/check-coverage.mjs` probes for them. If
absent, that is an upstream data gap — the connector surfaces it in tool
descriptions (absence of a result ≠ "the work doesn't exist"), it does not
silently drop it.

## License

MIT — see [LICENSE](LICENSE).
