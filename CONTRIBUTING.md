# Contributing to shamela-mcp

Thank you for helping improve this connector. It is a small, citation-sensitive
proxy around `shamela.ws`, so correctness and upstream load discipline matter
more than breadth of scraping.

## Before opening a pull request

Use Node 22 or newer and run the same offline health gate used by CI:

```bash
npm ci
npm test
npm run verify
```

`npm run verify` runs the complete offline test suite and a Wrangler dry run. Do
not treat a successful local live request as a substitute for these checks.

## Tests and fixtures

- Keep regression tests offline. Inject a fake `text()`/client and model the
  HTML after a real Shamela response.
- Add or update a saved fixture only when the markup shape is important to the
  parser; do not add a corpus dump or book text unnecessarily.
- Preserve the rule: **never guess and never fabricate**. If a page, marker,
  edition, or attribution cannot be verified, return `found: false` with a
  machine-readable reason, or expose an explicitly labelled approximation where
  the existing tool contract already requires one.
- Run `git diff --check` before committing.

## Live Shamela checks and indexes

The following commands need network access and are intentionally not part of
ordinary pull-request tests:

- `npm run resolve:canonical`
- `npm run build:index`
- `npm run build:tafsir`
- `npm run check:coverage`

Do not run an index-building script against Shamela as part of a broad parser
experiment. Use the smallest possible single-page verification, keep the
configured delay, and never commit book text. `src/data/hadith-index.mjs` is a
maintained generated data file; do not hand-edit its content. Index refreshes
belong in the scheduled/manual workflow and must be reviewed before merge.

## Code and compatibility rules

- Keep the existing tool names and response shapes. Add fields only when they
  make an existing response more honest or actionable; do not silently rename
  or remove fields.
- Keep network access behind the injected HTTP/client layer so tests remain
  deterministic.
- Use small, focused commits with English messages such as `fix: ...`,
  `test: ...`, `docs: ...`, or `chore: ...`.
- Avoid adding dependencies unless the benefit is clear and the lockfile is
  updated with `npm ci` verification.
- Never put API keys or other secrets in source, fixtures, logs, or pull
  requests. Configure `MCP_API_KEY` through Wrangler secrets when needed.

## Pull requests

Describe what was audited, what was fixed, and any risky or intentionally
unimplemented work. Include the relevant test commands and call out any
network/manual action required. Pull requests must not be auto-merged; review
CI and the generated-data diff first.

The repository uses `.editorconfig` for basic whitespace defaults. There is no
formatter mandate: avoid unrelated reformatting in a focused change.
