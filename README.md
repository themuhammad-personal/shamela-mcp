# shamela-mcp

An MCP (Model Context Protocol) server that exposes **[shamela.ws](https://shamela.ws)** — a large Arabic digital library of Islamic books — as a set of callable tools. Deployed as a Cloudflare Worker.

**Live endpoint:** `https://shamela-mcp.themuhammadpersonal.workers.dev/mcp`

## Tools

| Tool | Description |
|---|---|
| `get_categories` | Full category list with id / name / book_count |
| `get_books_by_category` | Paginated book list per category |
| `get_book_details` | Title, author, full table of contents, metadata |
| `get_book_page` | Arabic page text for a given book |
| `search_books_by_name` | Ranked title autocomplete |
| `search_library` | Native full-text search across all books, with any/all/exact-phrase modes, category and century filters, and pagination |
| `get_author_books` | Author name plus their published books |
| `get_recently_added` | Homepage "recently added" list |
| `list_all_books` | Bulk multi-category book listing |

## How it talks to shamela.ws

- `GET /ajax/book/?term=...` → title autocomplete (JSON)
- `GET /ajax/authors/?term=...` → author autocomplete (JSON)
- `POST /ajax/search` with `term`, `aqsam[]` (category ids), `decades[]` (Hijri century, `-2` = pre-Islamic), `page` → HTML result fragment
- Category / author / book pages are scraped from server-rendered HTML

Note: shamela's own `-word` exclude operator is unreliable (it broadens results instead of narrowing), so `exclude_words` is applied as a post-filter on returned snippets instead of relying on the site's operator.

## Project status

`src/worker.mjs` is the bundled JavaScript currently running in production, pulled directly from the Cloudflare API. It is bundled but not minified (names are still readable). The original multi-file source project is not currently in this repo; this file is the working reference until the source is reconstructed / re-split into modules.

## Development

```bash
npm install
npm run dev       # local dev via wrangler
npm run deploy    # deploy to Cloudflare
```

Requires a Cloudflare account and `wrangler login`, or a `CLOUDFLARE_API_TOKEN` in the environment.

## Deploying manually via API

```bash
curl -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F 'metadata={"main_module":"worker.mjs","compatibility_date":"2024-09-25","compatibility_flags":["nodejs_compat"]};type=application/json' \
  -F "worker.mjs=@src/worker.mjs;type=application/javascript+module" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/shamela-mcp"
```

## License

MIT — see [LICENSE](LICENSE).

---
_Last verified auto-deploy: 2026-09-03 03:05 UTC_
