<div align="center">

# 📚 shamela-mcp

### MCP Server for the Islamic Digital Library

**[shamela.ws](https://shamela.ws)** → Clean, structured tools for LLMs & AI agents

<br/>

[![Live](https://img.shields.io/badge/Live-Endpoint-00C853?style=for-the-badge&logo=cloudflare&logoColor=white)](https://shamela-mcp.themuhammadpersonal.workers.dev/mcp)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-≥22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Cloudflare](https://img.shields.io/badge/Deployed_on-Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

<br/>

**Live Endpoint**

```
https://shamela-mcp.themuhammadpersonal.workers.dev/mcp
```

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 Discovery
- Browse all categories & books
- Ranked title search
- Full-text library search with filters
- Recently added books

</td>
<td width="50%">

### 📖 Reading
- High-quality page extraction
- Main text + footnotes separated
- Volume & printed page numbers
- Chapter path navigation

</td>
</tr>
<tr>
<td width="50%">

### 📜 Hadith & Tafsir
- Hadith-by-number lookup
- On-page verification (no fabrication)
- Tafsir by ayah (Ibn Kathir, Tabari, Qurtubi)
- Narrator biographies (jarḥ wa taʿdīl)

</td>
<td width="50%">

### 🛡️ Reliability
- Canonical edition detection
- Structured error responses
- Never invents citations
- Optional API-key protection

</td>
</tr>
</table>

---

## 🛠️ Available Tools

| Tool | Description |
|:-----|:------------|
| `get_categories` | List all categories with book counts |
| `get_books_by_category` | Paginated books inside a category |
| `get_book_details` | Full metadata, TOC & edition info |
| `get_book_page` | Page text (paragraphs + footnotes), volume, printed page, chapter path |
| `search_books_by_name` | Ranked title search + canonical edition hints |
| `search_library` | Full-text search with filters & snippets |
| `get_author_books` | Author’s books + biography |
| `get_narrator_biography` | Narrator tarjamah (name, dates, ranks, jarḥ wa taʿdīl) |
| `get_hadith_by_number` | Hadith number → matn / isnād (verified on page) |
| `get_tafsir_by_ayah` | Sūrah:āyah → tafsīr passage |
| `get_page_by_printed_number` | Printed volume + page → Shamela page |
| `get_recently_added` | Recently added books |
| `list_all_books` | Bulk multi-category listing |
| `list_canonical_editions` | Hand-verified canonical editions |

> Every tool returns structured data.  
> If a citation cannot be verified on the live page → `{ "found": false }`.

---

## 🚀 Quick Start

### Basic Configuration

```json
{
  "mcpServers": {
    "shamela": {
      "url": "https://shamela-mcp.themuhammadpersonal.workers.dev/mcp"
    }
  }
}
```

### With API Key (recommended for production)

```json
{
  "mcpServers": {
    "shamela": {
      "url": "https://shamela-mcp.themuhammadpersonal.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

---

## ⚙️ Development

**Requirements:** Node.js ≥ 22

```bash
# Install dependencies
npm ci

# Run offline tests
npm test

# Full verification (tests + dry-run build)
npm run verify

# Local development
npm run dev

# Deploy to Cloudflare
npm run deploy
```

Optional live tests:

```bash
npm run test:live
```

---

## 🔐 Optional API Key Protection

By default the endpoint is open. To lock it down:

```bash
wrangler secret put MCP_API_KEY
```

Then every request must include one of:

- `Authorization: Bearer <key>` *(preferred)*
- `X-API-Key: <key>`

To remove protection:

```bash
wrangler secret delete MCP_API_KEY
```

---

## 📁 Project Structure

```text
src/
├── index.mjs                 # Worker entry (MCP over Streamable HTTP)
├── tools.mjs                 # Tool definitions & handlers
├── canonical-editions.mjs    # Canonical edition logic
├── lib/                      # Core libraries
│   ├── shamela.mjs           # Scraping client
│   ├── page.mjs              # Page parser
│   ├── citation-detect.mjs   # Hadith / ayah markers
│   ├── tarjama.mjs           # Biography parsers
│   ├── hadith-index.mjs      # Index + live resolvers
│   ├── auth.mjs              # Optional API-key gate
│   └── ...
└── data/                     # Static indexes & canonical IDs

scripts/                      # Index builders & validators
test/                         # Offline + live tests
.github/workflows/            # CI & deploy
```

---

## 📜 Attribution & License

This project is an **independent client** of [shamela.ws](https://shamela.ws).  
It is **not affiliated** with المكتبة الشاملة.

- Fetches only the pages the user requests
- Does **not** mirror or redistribute the library
- Stores only small citation indexes (no book text)
- Every response includes `book_id`, edition info, and direct Shamela URL for proper attribution

**License:** [MIT](LICENSE)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Please keep changes focused, maintain offline test coverage, and never invent unverified citations.

---

<div align="center">

**Made for researchers, students & AI agents exploring the Islamic tradition**

</div>
