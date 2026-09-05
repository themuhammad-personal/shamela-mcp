/**
 * MCP tool definitions + handlers (the wiring layer).
 *
 * This is the only module that imports the MCP SDK + zod. All scraping logic
 * lives in `lib/shamela.mjs`; citation-addressable lookups in
 * `lib/hadith-index.mjs`; canonical-edition detection in
 * `canonical-editions.mjs`. The client is injectable for offline tests.
 *
 * Every handler runs through `guarded()`: shamela.ws is a third-party site we
 * do not control, so a fetch failure must come back as a *structured,
 * actionable* error rather than the runtime's raw "Network connection lost."
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHttp } from "./lib/http.mjs";
import { createClient } from "./lib/shamela.mjs";
import { canonicalFields, canonicalMapStatus, CANONICAL_EDITIONS, canonicalRecord } from "./canonical-editions.mjs";
import {
  resolveHadith,
  resolveHadithLive,
  resolveTafsirAyah,
  resolveTafsirAyahBounded,
  hadithNumbersOnPage,
  indexStatus,
} from "./lib/hadith-index.mjs";
import { detectHadithNumbers, detectHadithMarkers, extractHadith, detectAyahReferences, detectQuranBracketAyahs, gradingAcrossPages } from "./lib/citation-detect.mjs";
import { normalizeArabic } from "./lib/arabic.mjs";

export const SERVER_VERSION = "2.5.0";

const response = (x) => ({ content: [{ type: "text", text: JSON.stringify(x, null, 2) }] });

// Keep the upstream cache, concurrency gate, in-flight de-duplication and
// details cache alive for the lifetime of a Worker isolate. A new MCP server
// and transport is still created per stateless HTTP request, but the expensive
// upstream state must not be recreated with them.
const sharedHttp = createHttp();
const sharedClient = createClient({ text: sharedHttp.text });

const idParam = z.string().regex(/^[1-9]\d{0,11}$/);
const intId = z.coerce.string().regex(/^[1-9]\d{0,11}$/);
const pageParam = z.coerce.string().regex(/^[1-9]\d{0,11}$/);

/**
 * Turn a thrown error into something a caller can act on.
 *
 * `kind` is the machine-readable part:
 *   - `upstream_http` — shamela.ws answered with an HTTP status (429/403 ⇒
 *     almost always rate-limiting or bot-blocking; retry later, don't retry now)
 *   - `network`       — shamela.ws was unreachable from the Worker
 *   - `bad_request`   — the tool arguments were rejected by validation
 *   - `internal`      — our own bug; the message is included for diagnosis
 *
 * Stacks are never returned — they leak internals and are useless to the model.
 */
/** Keep the human-readable part of a message, drop any stack frames riding along. */
function sanitize(message) {
  return String(message)
    .split("\n")
    .filter((line) => !/^\s*at\s+\S/.test(line)) // leading "    at fn (file:1:1)" frames
    .join(" ")
    .replace(/\s+at\s+[^\s()]+\s*\([^)]*:\d+:\d+\)/g, "") // frames inline in a message
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyError(err) {
  const message = sanitize(err?.message ?? err ?? "unknown error");
  if (err?.code === "SHAMELA_INVALID_BODY") {
    return {
      kind: "upstream_invalid",
      message,
      hint: "shamela.ws HTTP 200 দিলেও usable book/search HTML দেয়নি (সম্ভবত empty বা bot-challenge body)। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    };
  }
  const httpMatch = /HTTP\s+(\d{3})/i.exec(message);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    return {
      kind: "upstream_http",
      status,
      message,
      hint:
        status === 429 || status === 403
          ? "shamela.ws সম্ভবত rate-limit/bot-block করেছে। কিছুক্ষণ পরে আবার চেষ্টা করুন; এখনই বারবার retry করবেন না।"
          : "shamela.ws এই request-এ এই status ফেরত দিয়েছে। book_id/page_number ঠিক আছে কিনা যাচাই করুন।",
    };
  }
  if (/network|socket|tls|fetch failed|timed? ?out|aborted|dns|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) {
    return {
      kind: "network",
      message,
      hint: "shamela.ws-এ পৌঁছানো যায়নি (network/DNS/timeout)। এটা আপনার query-র দোষ নয় — পরে আবার চেষ্টা করুন।",
    };
  }
  if (/invalid|expected|required|too_small|too_big|ZodError/i.test(message)) {
    return { kind: "bad_request", message, hint: "tool-এর arguments সঠিক নয় — schema অনুযায়ী পাঠান।" };
  }
  return { kind: "internal", message, hint: "connector-এর ভেতরে অপ্রত্যাশিত error হয়েছে।" };
}

/**
 * Verification-status contract attached to every citation-shaped response
 * (`get_hadith_by_number`, `get_tafsir_by_ayah`, `get_page_by_printed_number`,
 * and the `guarded()` error path). Purely additive — `verification` never
 * replaces `found`/`ok`/`error`, it only labels *why* the tool landed where it
 * did, using one vocabulary:
 *
 *   verified         — the requested marker/number is on the page fetched now
 *   ambiguous         — a real match exists but per-kitab numbering (Muwatta) or
 *                       another structural fact leaves more than one candidate
 *   not_found         — a live, completed check found no matching marker
 *   unverified        — a static index pointed somewhere, but re-verification
 *                       against the live page failed, or the location is an
 *                       approximation (nearest_before/surah_start), not a match
 *   upstream_blocked  — shamela.ws refused the request (HTTP 403); this is
 *                       never reported as `not_found`
 *   inconclusive      — a transient failure (429/5xx/network/timeout/bad body)
 *                       means the source was never actually read; never
 *                       reported as `not_found` either
 *
 * `upstream_blocked` and `inconclusive` must never be downgraded to
 * `not_found` by a caller — the source was not read, so absence is not proven.
 */
function verified(evidence) {
  return { status: "verified", evidence };
}
function ambiguous(evidence) {
  return { status: "ambiguous", evidence };
}
function notFound(evidence) {
  return { status: "not_found", evidence };
}
function unverified(evidence) {
  return { status: "unverified", evidence };
}

/**
 * Map a classified error (see `classifyError`) onto the verification contract.
 * `bad_request`/`internal` are not source-reachability facts — they never got
 * far enough to say anything about a citation — so they carry no `verification`.
 */
function verificationForError(info) {
  if (info.kind === "bad_request" || info.kind === "internal") return null;
  if (info.kind === "upstream_http" && info.status === 403) {
    return { status: "upstream_blocked", evidence: "http_403" };
  }
  return { status: "inconclusive", evidence: info.kind === "upstream_http" ? `http_${info.status}` : info.kind };
}

/** Wrap a handler so failures are structured instead of opaque. */
function guarded(tool, handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const info = classifyError(err);
      const v = verificationForError(info);
      return {
        ...response({
          ok: false,
          tool,
          error: info.kind,
          detail: info.message,
          ...(info.status ? { status: info.status } : {}),
          hint: info.hint,
          fabricated: false,
          ...(v ? { verification: v } : {}),
          note: "কোনো তথ্য অনুমান করা হয়নি — source থেকে কিছুই ফেরত দেওয়া হয়নি।",
        }),
        isError: true,
      };
    }
  };
}

// The SDK validates tool arguments before invoking the callback. Override its
// plain-text validation result so malformed calls obey the same public contract
// as upstream/runtime failures.
// `createToolError` is an undocumented internal of @modelcontextprotocol/sdk,
// verified on the version pinned in package-lock.json; the schema-error test in
// `test/auth.test.mjs` is the guard — if that test fails after an SDK upgrade,
// this override must be revisited.
class StructuredMcpServer extends McpServer {
  createToolError(errorMessage) {
    const message = String(errorMessage ?? "unknown error");
    const validation = /Input validation error: Invalid arguments for tool ([A-Za-z0-9_-]+):\s*([\s\S]*)/i.exec(message);
    const tool = validation?.[1] ?? /tool\s+([A-Za-z0-9_-]+)/i.exec(message)?.[1] ?? "unknown";
    const info = validation
      ? { kind: "bad_request", message: sanitize(validation[2] || message), hint: "tool-এর arguments সঠিক নয় — schema অনুযায়ী পাঠান।" }
      : classifyError(message);
    const v = verificationForError(info);
    return {
      ...response({
        ok: false,
        tool,
        error: info.kind,
        detail: info.message,
        ...(info.status ? { status: info.status } : {}),
        hint: info.hint,
        fabricated: false,
        ...(v ? { verification: v } : {}),
        note: "কোনো তথ্য অনুমান করা হয়নি — source থেকে কিছুই ফেরত দেওয়া হয়নি।",
      }),
      isError: true,
    };
  }
}

export function createServer(client = sharedClient) {
  const s = new StructuredMcpServer({ name: "shamela-library", version: SERVER_VERSION });
  // `registerTool` is the non-deprecated API in SDK ≥1.30 (`tool()` is @deprecated).
  const tool = (name, description, schema, handler) =>
    s.registerTool(name, { description, inputSchema: schema }, guarded(name, handler));

  // `N -` is also used for numbered poetry/prose. Treat it as a hadith marker
  // only when the edition is whitelisted as hadith or the page itself carries
  // Shamela's hadith-number input as independent evidence.
  const hadithNumbersWithEvidence = (bookId, page) => {
    const knownHadithEdition = canonicalRecord(bookId)?.type === "hadith";
    const pageIdentifiesHadith = /^\d+$/.test(String(page.hadith_number_hint ?? ""));
    return knownHadithEdition || pageIdentifiesHadith ? detectHadithNumbers(page.paragraphs) : [];
  };

  tool("get_categories", "Shamela-র সম্পূর্ণ category তালিকা (id, নাম, বই সংখ্যা)।", {}, async () =>
    response({ items: await client.categories() }),
  );

  tool("get_books_by_category", "একটি category-র বই, page সহ।", { category_id: idParam, page: z.number().int().min(1).default(1) }, async (x) =>
    response(await client.booksByCategory(x.category_id, x.page)),
  );

  tool(
    "get_book_details",
    "বইয়ের title, author, metadata (muhaqqiq, publisher, parts, pagination_matches_print, hadith_numbering_service) ও সূচিপত্র (TOC)। is_canonical_numbering শুধুমাত্র হাতে-যাচাই করা book_id whitelist থেকে আসে; canonical_edition.confidence = verified | other_edition | title — other_edition হলে canonical_book_id-তে standard সংস্করণ দেওয়া থাকে।",
    { book_id: idParam },
    async (x) => {
      try {
        const d = await client.details(x.book_id);
        return response({ ...d, ...canonicalFields({ book_id: d.book_id, title: d.title, muhaqqiq: d.metadata?.muhaqqiq }) });
      } catch (err) {
        const is403 = /403/.test(String(err?.message ?? "")) || err?.status === 403;
        const canonFields = canonicalFields({ book_id: x.book_id });
        if (is403 && canonFields.is_canonical_numbering) {
          const canon = canonicalRecord(x.book_id);
          try {
            const samplePage = await client.bookPage(x.book_id, 1);
            if (samplePage && (samplePage.book_title || samplePage.author)) {
              return response({
                id: x.book_id,
                book_id: x.book_id,
                title: canon.title || samplePage.book_title || "",
                author: samplePage.author || "",
                author_id: "",
                category: "",
                category_id: "",
                toc: [],
                metadata: {
                  publisher: "",
                  edition: "",
                  muhaqqiq: "",
                  page_count: samplePage.nav?.last || "",
                  parts: samplePage.volume || "",
                  pagination_matches_print: true,
                  hadith_numbering_service: true,
                  fallback_used: true,
                  fallback_reason: "upstream_overview_blocked_403",
                },
                url: `https://shamela.ws/book/${x.book_id}`,
                metadata_fallback: true,
                metadata_note: "Upstream /book overview endpoint blocked (HTTP 403); limited metadata resolved via permitted page fetch and verified canonical registry.",
                ...canonicalFields({ book_id: x.book_id, title: canon.title }),
              });
            }
          } catch {
            // Page fetch failed as well; rethrow original error
          }
        }
        throw err;
      }
    },
  );

  tool(
    "get_book_page",
    "বইয়ের নির্দিষ্ট Shamela page/node-এর আরবি টেক্সট — paragraphs, footnotes (hamesh) আলাদা, volume/printed_page, chapter_path, prev/next nav সহ। hadith_numbers = এই পৃষ্ঠার অনুচ্ছেদ-শুরুতে ছাপা হাদিস নম্বর (footnote বাদ); ayah_refs = পৃষ্ঠায় স্পষ্টভাবে উল্লিখিত [সূরা: আয়াত] রেফারেন্স। hadith_numbers কেবল whitelisted hadith edition বা Shamela-র hadith-number input থাকা পৃষ্ঠায় দেওয়া হয়; অন্যথায় []।",
    { book_id: idParam, page_number: pageParam },
    async (x) => {
      const p = await client.bookPage(x.book_id, x.page_number);
      const onPage = hadithNumbersWithEvidence(x.book_id, p);
      const ayahEvidence = detectAyahReferences(p.paragraphs);
      return response({
        ...p,
        hadith_numbers: onPage,
        hadith_numbers_source: onPage.length ? "page_markers" : "none",
        ayah_refs: ayahEvidence.refs,
        ayah_ref_metadata: ayahEvidence.metadata,
        ayah_refs_truncated: ayahEvidence.truncated,
        ...canonicalFields({ book_id: x.book_id, title: p.book_title }),
      });
    },
  );

  tool(
    "search_books_by_name",
    "Arabic-normalized, ranked বই-শিরোনাম সার্চ (book_id + pagination)। প্রতিটি ফলাফলে is_canonical_numbering (whitelist-ভিত্তিক) ও canonical_edition থাকে; একই গ্রন্থের non-canonical সংস্করণে canonical_book_id দেওয়া থাকে। দ্রষ্টব্য: shamela.ws-এর আরবি corpus-এ কিছু উপমহাদেশীয় হানাফি/উর্দু-উৎস রচনা (যেমন معارف القرآن, بيان القرآن) নাও থাকতে পারে — ফলাফল না থাকা মানে রচনাটি 'অস্তিত্বহীন' নয়।",
    { query: z.string().min(2).max(200), page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(30).default(10) },
    async (x) => {
      const r = await client.titleSearch(x.query, x.page, x.limit);
      r.results = r.results.map((b) => ({ ...b, ...canonicalFields(b) }));
      return response(r);
    },
  );

  tool(
    "search_library",
    "Shamela native full-text search: any/all/exact-phrase, exclude_words, category ও century ফিল্টার, pagination। শতক (century) হিজরি, '-2' = জাহিলি যুগ। exclude_words শুধু ফেরত-আসা snippet-এ প্রযোজ্য (সম্পূর্ণ কর্পাস থেকে বাদ নয়)। প্রতিটি ফলাফল = {title, author, url, snippet, book_id, page_id}; সংশ্লিষ্ট হাদিস নম্বর/আয়াত জানতে সেই page_id দিয়ে get_book_page (hadith_numbers, ayah_refs দেয়) বা get_hadith_by_number ব্যবহার করুন। hadith_numbers ফিল্ড কেবল তখনই থাকে যখন static সূচি ওই পৃষ্ঠাটি চেনে (index_status দেখুন)।",
    {
      query: z.string().min(1).max(250),
      match_mode: z.enum(["any_words", "all_words", "exact_phrase"]).default("any_words"),
      exclude_words: z.array(z.string().min(1).max(80)).max(10).optional(),
      categories: z.array(z.string().regex(/^[1-9]\d{0,11}$/)).max(10).optional(),
      century: z.array(z.string().regex(/^-?\d+$/)).max(10).optional(),
      page: z.number().int().min(1).max(500).default(1),
    },
    async (x) => {
      const r = await client.searchLibrary(x.query, x.match_mode, x.exclude_words || [], x.categories || [], x.century || [], x.page);
      let enriched = 0;
      r.results = (r.results ?? []).map((res) => {
        const nums = hadithNumbersOnPage(res.book_id, res.page_id);
        if (!nums.length) return res; // field absent — never an empty/undefined placeholder
        enriched += 1;
        return { ...res, hadith_numbers: nums };
      });
      const status = indexStatus();
      return response({
        ...r,
        // Honest note about the enrichment so a caller never waits for a field that cannot appear.
        hadith_numbers_note:
          enriched > 0
            ? `${enriched}/${r.results.length} ফলাফলে static সূচি থেকে hadith_numbers যুক্ত হয়েছে।`
            : status.hadith_entries
              ? "কোনো ফলাফলের পৃষ্ঠা static হাদিস-সূচিতে নেই — hadith_numbers অনুপস্থিত; page_id দিয়ে get_book_page দেখুন।"
              : "static হাদিস-সূচি এখনো খালি — search ফলাফলে hadith_numbers থাকবে না; page_id দিয়ে get_book_page (hadith_numbers/ayah_refs) ব্যবহার করুন।",
      });
    },
  );

  tool(
    "get_author_books",
    "একজন লেখকের Shamela author page: তার বই + «تعريف بالمؤلف» জীবনী (biography: headline, full_name, born/died hijri & CE, biography বুলেট, works, references, source — সাধারণত «الأعلام» للزركلي থেকে উদ্ধৃত; পাতায় না থাকলে biography:null + biography_status)।",
    { author_id: idParam },
    async (x) => response(await client.authorBooks(x.author_id)),
  );

  tool(
    "get_narrator_biography",
    "হাদিস রাবীর তরজমা (رجال card): shamela.ws/narrator/<id> — সনদের প্রতিটি নামে এই লিংক থাকে (get_book_page / get_hadith_by_number-এর isnad-এ)। ফেরত: নাম, লকব, কুনিয়া, নসব, আকীদা, জন্ম/মৃত্যু (হিজরি সংখ্যাসহ), তাকরীবের তবকা, ইবনে হাজার ও যাহাবীর রুতবা (Shamela যা ছাপে, হুবহু উদ্ধৃত), এবং «الجرح والتعديل» তালিকা — প্রতিটি নাকিদের নামে তার উক্তি + উৎস (যেমন [تهذي�� التهذيب (3/ 28)])। কোনো গণনাকৃত 'reliability' নেই; শুধু উদ্ধৃত ও attributed উক্তি।",
    { narrator_id: idParam },
    async (x) => {
      const r = await client.narratorTarjama(x.narrator_id);
      return response({
        ...r,
        note: r.found
          ? "রুতবা ও জারহ-তাদীলের উক্তিগুলো Shamela-র narrator card থেকে হুবহু; প্রতিটির উৎস ব্র্যাকেটে। চূড়ান্ত হুকুম নিজে দিন না — উদ্ধৃতি দিন।"
          : "এই narrator_id-তে Shamela কোনো তরজমা দেখায়নি। সনদের নামের /narrator/<id> লিংক থেকে id নিন।",
      });
    },
  );

  tool("get_recently_added", "Shamela homepage-এ সাম্প্রতিক যোগ হওয়া বই।", {}, async () =>
    response(await client.recent()),
  );

  tool("list_all_books", "প্রথম কয়েকটি category থেকে সম্মিলিত বইয়ের তালিকা।", { limit: z.number().int().min(1).max(300).default(100) }, async (x) =>
    response(await client.allBooks(x.limit)),
  );

  // --- Priority 1: hadith-number-addressable retrieval ---
  tool(
    "get_hadith_by_number",
    "হাদিস নম্বর → matn/isnad (+ সম্পাদকীয় হুকুম: পৃষ্ঠার টীকায় স্পষ্ট «[حكم الألباني] : …» থাকলে grading ফিল্ডে — তিরমিযী/আবু দাউদ/নাসাঈ/ইবনে মাজাহ সংস্করণে; বুখারী/মুসলিমে থাকে না; মতনের নিজস্ব «حسن صحيح» হুকুম হিসেবে ধরা হয় না), পৃষ্ঠা অনুমান ছাড়া। ধাপ: (1) static সূচি; (2) না থাকলে Shamela-র নিজস্ব 'رقم الحديث' lookup (/ajax/specialnumber2id) → পৃষ্ঠা আনা → অনুচ্ছেদ-শুরুতে «N -» marker আছে কিনা যাচাই। marker না মিললে found:false + কারণ, কখনো অনুমান নয়। canonical সংস্করণের book_id-র জন্য list_canonical_editions দেখুন (যেমন বুখারী 1681, মুসলিম 1727)। সতর্কতা: মুয়াত্তা (1699)-তে নম্বর প্রতি কিতাবে নতুন করে শুরু হয়।",
    { book_id: idParam, hadith_number: intId },
    async (x) => {
      const canon = canonicalFields({ book_id: x.book_id });
      const cached = resolveHadith(x.book_id, x.hadith_number);
      if (cached.found) {
        const live = await resolveHadithLive(client, x.book_id, x.hadith_number).catch(() => null);
        if (live?.found) return response(formatHadith(live, canon));

        // A static page is only a location hint. Even when live verification is
        // unavailable, the requested marker must be present in the fetched page
        // before this tool can return found:true.
        const page = live?.page_data ?? (await client.bookPage(cached.book_id, cached.page));
        const hit = extractHadith(page.paragraphs, x.hadith_number);
        if (!hit) {
          return response({
            found: false,
            reason: "static_index_marker_not_on_page",
            book_id: x.book_id,
            hadith_number: x.hadith_number,
            page: cached.page,
            ...canon,
            verification: unverified("stale_index"),
            note: "static সূচি এই পৃষ্ঠাটি দেখালেও বর্তমান পৃষ্ঠায় অনুচ্ছেদ-শুরুতে চাওয়া নম্বরটি নেই; stale index বা edition পরিবর্তন হতে পারে। কোনো matn অনুমান করা হয়নি।",
          });
        }
        const pageNumbers = detectHadithNumbers(page.paragraphs);
        const chunks = [page];
        const slices = [{ page, start: hit.starts_at_paragraph, end: hit.starts_at_paragraph + hit.paragraphs.length }];
        let text = hit.text;
        let cursor = page;
        let continuationComplete = !hit.ends_at_page_end || !cursor.nav?.next;
        for (let i = 0; i < 2 && !continuationComplete; i += 1) {
          let nextPage;
          try {
            nextPage = await client.bookPage(cached.book_id, cursor.nav.next);
          } catch {
            break;
          }
          const nextMarkers = detectHadithMarkers(nextPage.paragraphs);
          const other = nextMarkers.find((m) => m.number !== String(x.hadith_number));
          const cut = other ? other.paragraph : nextPage.paragraphs.length;
          if (cut === 0) {
            continuationComplete = true;
            break;
          }
          text += "\n" + nextPage.paragraphs.slice(0, cut).join("\n");
          chunks.push(nextPage);
          slices.push({ page: nextPage, start: 0, end: cut });
          if (other || !nextPage.nav?.next) continuationComplete = true;
          cursor = nextPage;
        }

        return response(
          formatHadith(
            {
              ...cached,
              text,
              page_data: page,
              spans_pages: chunks.map((c) => c.page_number),
              numbers_on_page: [...new Set(chunks.flatMap((c) => detectHadithNumbers(c.paragraphs)))],
              routes_on_page: hit.routes_on_page,
              narrator_links: slices.flatMap(({ page: chunk, start, end }) =>
                (chunk.narrator_links ?? []).filter((link) => link.paragraph >= start && link.paragraph < end),
              ),
              pages: chunks.map((c) => ({
                page: c.page_number,
                footnotes: c.footnotes ?? [],
                paragraphs: c.paragraphs ?? [],
                numbers: detectHadithNumbers(c.paragraphs),
              })),
              verified_on_page: true,
              continuation_complete: continuationComplete,
              ...(continuationComplete ? {} : { continuation_note: "static index fallback returned verified pages up to continuation limit; the hadith continues beyond." }),
            },
            canon,
          ),
        );
      }
      const live = await resolveHadithLive(client, x.book_id, x.hadith_number);
      if (!live.found) {
        const { page_data, ...rest } = live;
        return response({
          ...rest,
          book_id: x.book_id,
          ...canon,
          index_status: indexStatus(),
          canonical_map: canonicalMapStatus(),
          // The source was actually reached and read (no exception — that would
          // have gone through `guarded()` as upstream_blocked/inconclusive
          // instead); a completed live check simply found no matching marker.
          verification: notFound(live.reason),
          ...(page_data
            ? { page_preview: { page: page_data.page_number, chapter_path: page_data.chapter_path, first_paragraph: page_data.paragraphs?.[0]?.slice(0, 200) } }
            : {}),
          hint:
            canon.canonical_edition?.confidence === "other_edition"
              ? `এই book_id canonical সংস্করণ নয়; standard নম্বরের জন্য book_id ${canon.canonical_edition.canonical_book_id} ব্যবহার করুন।`
              : "এই বইয়ে Shamela-র হাদিস-নম্বর lookup নেই, অথবা নম্বরটি এই সংস্করণে নেই। list_canonical_editions দিয়ে সঠিক সংস্করণ বেছে নিন।",
        });
      }
      return response(formatHadith(live, canon));
    },
  );

  function formatHadith(r, canon) {
    const pd = r.page_data ?? {};
    const rec = canonicalRecord(r.book_id);
    const numberingAmbiguous = rec?.perKitabNumbering === true;
    const resolvedKitab = numberingAmbiguous
      ? pd.chapter_path?.find((entry) => /(^|\s)كتاب(?:\s|$)/u.test(String(entry.title ?? "")))?.title ?? null
      : null;
    // Editorial grading: ONLY an explicit «[حكم الألباني] : …» / «قال الألباني: …»
    // in the apparatus of the page(s) this hadith is printed on; attributed to
    // this hadith only when unambiguous. Tirmidhi's own «حسن صحيح» in the matn is
    // never reported as a grading.
    const pages = r.pages ?? [{ page: r.page, footnotes: pd.footnotes ?? [], paragraphs: pd.paragraphs ?? [], numbers: r.numbers_on_page ?? detectHadithNumbers(pd.paragraphs ?? []) }];
    const g = gradingAcrossPages(pages, r.hadith_number);
    const verifiedOnPage = r.verified_on_page ?? r.source !== "static_index";
    // Per-kitab numbering (Muwatta) with no kitab resolved from chapter_path
    // leaves a real candidate ambiguity even though a page marker matched —
    // report `ambiguous`, never `verified`, until the kitab is confirmed.
    const verification =
      numberingAmbiguous && !resolvedKitab
        ? ambiguous("kitab_unresolved")
        : !verifiedOnPage
          ? unverified("index_not_reverified")
          : verified(numberingAmbiguous ? "page_marker+kitab_resolved" : "page_marker");
    return {
      found: true,
      book_id: r.book_id,
      hadith_number: r.hadith_number,
      page: r.page,
      spans_pages: r.spans_pages,
      book_title: pd.book_title,
      author: pd.author,
      volume: pd.volume,
      printed_page: pd.printed_page,
      chapter_path: pd.chapter_path,
      matn: r.text,
      narrator_links: r.narrator_links?.length ? r.narrator_links : undefined,
      numbering_ambiguous: numberingAmbiguous,
      ...(numberingAmbiguous
        ? {
            warning: "এই মুয়াত্তা সংস্করণে হাদিস নম্বর প্রতি কিতাবে পুনরায় শুরু হয়; (কিতাব, নম্বর) একসঙ্গে উল্লেখ ও chapter_path যাচাই করুন।",
            resolved_kitab: resolvedKitab,
          }
        : {}),
      // Real pages are fully vocalised («حَدَّثَنَا»), so strip harakat first.
      isnad_present: /حدثنا|اخبرنا|انبانا|حدثني|اخبرني|سمعت/.test(normalizeArabic(r.text ?? "")),
      routes_on_page: r.routes_on_page,
      other_numbers_on_page: r.numbers_on_page,
      footnotes: pd.footnotes?.length ? pd.footnotes : undefined,
      grading: g.grading,
      gradings_on_page: g.gradings_on_page.length ? g.gradings_on_page : undefined,
      grading_note: g.grading_note,
      source: r.source,
      verified_on_page: verifiedOnPage,
      continuation_complete: r.continuation_complete ?? true,
      ...(r.continuation_issue ? { continuation_issue: r.continuation_issue } : {}),
      ...(r.continuation_note ? { continuation_note: r.continuation_note } : {}),
      ...canon,
      verification,
      citation: {
        book_id: r.book_id,
        edition: canonicalRecord(r.book_id)?.title ?? pd.book_title,
        numbering: canonicalRecord(r.book_id)?.numbering ?? null,
        hadith_number: r.hadith_number,
        volume: pd.volume,
        printed_page: pd.printed_page,
        page: r.page,
        url: pd.url,
        verification,
      },
    };
  }

  // --- Priority 2: ayah-addressable tafsir retrieval ---
  tool(
    "get_tafsir_by_ayah",
    "তাফসির বই (book_id) + (surah, ayah) → সেই আয়াতের আলোচনার পৃষ্ঠা। উৎস: persisted সূচি (src/data/tafsir-index.mjs: প্রতিটি সূরার পৃষ্ঠা-পরিসর + জানা আয়াত→পৃষ্ঠা)। আয়াত সূচিতে না থাকলে শুধু সেই সূরার পরিসরের ভেতরে ﴿…(n)…﴾ marker ধরে bisection (সর্বোচ্চ ২০ পৃষ্ঠা পড়া) — TOC থেকে বই হাঁটা হয় না। ফলাফলে precision: exact | nearest_before | surah_start (ফাতিহা inline উদ্ধৃত, ব্লক নেই)। সূচিভুক্ত তাফসির (প্রতিটিতে ১১৪ সূরার পরিসর): ইবনে কাসীর 8473, তাবারী 7798 (ت التركي), কুরতুবী 20855 (দারুল কুতুব আল-মিসরিয়্যাহ; আয়াত-শিরোনাম «[سورة X (n): آية m]» ধরে)।",
    { book_id: idParam, surah: z.number().int().min(1).max(114), ayah: z.number().int().min(1) },
    async (x) => {
      let res = resolveTafsirAyah(x.book_id, x.surah, x.ayah);
      if (!res.found) res = await resolveTafsirAyahBounded(client, x.book_id, x.surah, x.ayah);
      if (!res.found) {
        // "invalid_ayah_reference"/"ayah_out_of_range" are definitive (the
        // reference itself is impossible). "no_tafsir_index_for_book" and
        // "surah_not_indexed" mean no lookup — persisted or bounded live — was
        // even possible, so absence is not proven. "ayah_not_located_within_budget"
        // means a bounded *live* search ran and still could not place the ayah
        // within its page budget — real doubt remains, not proof of absence.
        const tafsirNotFoundVerification =
          res.reason === "invalid_ayah_reference" || res.reason === "ayah_out_of_range" ? notFound(res.reason) : unverified(res.reason);
        return response({
          ...res,
          book_id: x.book_id,
          index_status: indexStatus(),
          ...canonicalFields({ book_id: x.book_id }),
          verification: tafsirNotFoundVerification,
          hint:
            res.reason === "no_tafsir_index_for_book"
              ? "এই book_id-র জন্য persisted তাফসির সূচি নেই (বর্তমানে: ইবনে কাসীর 8473, তাবারী 7798, কুরতুবী 20855)। scripts/build-tafsir-index.mjs --tafsir <id> চালিয়ে সূচি তৈরি করুন, অথবা get_book_details → get_book_page ব্যবহার করুন।"
              : "get_book_details দিয়ে TOC দেখে get_book_page ব্যবহার করুন।",
        });
      }
      const page = await client.bookPage(res.book_id, res.page);
      const markedAyahs = detectQuranBracketAyahs(page.paragraphs ?? [], res.surah);
      // The persisted map is a location hint, not proof. Re-check exact answers
      // against the page currently served so a stale map cannot fabricate a
      // citation after Shamela changes an edition or page id.
      if (res.precision === "exact" && !markedAyahs.includes(Number(res.ayah))) {
        return response({
          found: false,
          reason: "static_index_marker_not_on_page",
          book_id: res.book_id,
          surah: res.surah,
          ayah: res.ayah,
          page: res.page,
          source: res.source,
          index_status: indexStatus(),
          ...canonicalFields({ book_id: res.book_id }),
          verification: unverified("stale_index"),
          note: "তাফসির সূচি এই পৃষ্ঠাটি দেখালেও বর্তমান পৃষ্ঠায় চাওয়া আয়াতের marker নেই; stale index বা edition পরিবর্তন হতে পারে। কোনো passage অনুমান করা হয়নি।",
        });
      }
      const exactOnPage = res.precision === "exact" && markedAyahs.includes(Number(res.ayah));
      // Only an exact ayah-bracket match on the currently fetched page is
      // `verified`; `nearest_before`/`surah_start` are approximations by
      // construction — the specific ayah's marker was never found.
      const tafsirVerification = exactOnPage ? verified("ayah_marker") : unverified(`approximate_${res.precision}`);
      return response({
        found: true,
        book_id: res.book_id,
        surah: res.surah,
        ayah: res.ayah,
        page: res.page,
        precision: res.precision,
        source: res.source,
        verified_on_page: exactOnPage,
        verification: tafsirVerification,
        note: res.note,
        surah_range: res.surah_range,
        pages_fetched: res.pages_fetched,
        ayahs_marked_on_page: res.ayahs_marked_on_page ?? markedAyahs,
        book_title: page.book_title,
        volume: page.volume,
        printed_page: page.printed_page,
        chapter_path: page.chapter_path,
        passage: page.content,
        footnotes: page.footnotes?.length ? page.footnotes : undefined,
        nav: page.nav,
        ...canonicalFields({ book_id: res.book_id }),
        citation: {
          book_id: res.book_id,
          surah: res.surah,
          ayah: res.ayah,
          volume: page.volume,
          printed_page: page.printed_page,
          page: res.page,
          url: page.url,
          verification: tafsirVerification,
        },
      });
    },
  );

  // --- canonical edition directory ---
  tool(
    "list_canonical_editions",
    "যাচাইকৃত canonical সংস্করণের তালিকা: প্রতিটি হাদিসগ্রন্থ/তাফসিরের কোন Shamela book_id standard নম্বর বহন করে (বুখারী 1681, মুসলিম 1727, আবু দাউদ 1726, তিরমিযী 1435, নাসাঈ 829, ইবনে মাজাহ 1198, মুয়াত্তা 1699, মুসনাদ আহমাদ 25794, ইবনে কাসীর 8473, তাবারী 7798, কুরতুবী 20855), নম্বরের উৎস, শেষ নম্বর, এবং একই গ্রন্থের non-canonical সংস্করণসমূহ।",
    {},
    async () => response({ ...canonicalMapStatus(), editions: CANONICAL_EDITIONS }),
  );

  // --- printed volume/page → shamela page id ---
  tool(
    "get_page_by_printed_number",
    "ছাপা সংস্করণের (জুয/খণ্ড, পৃষ্ঠা) → Shamela page। Shamela-র /ajax/pagenum2id ব্যবহার করে; 'ترقيم الكتاب موافق للمطبوع' বইতে নির্ভরযোগ্য। না মিললে found:false। hadith_numbers কেবল whitelisted hadith edition বা Shamela-র hadith-number input থাকা পৃষ্ঠায় দেওয়া হয়; অন্যথায় []।",
    { book_id: idParam, volume: pageParam, printed_page: pageParam },
    async (x) => {
      const page = await client.printedPageId(x.book_id, x.volume, x.printed_page);
      // A completed live call to shamela's own /ajax/pagenum2id either resolved
      // a page or definitively did not — no page fetch was made either way, so
      // "not_found" is warranted (nothing was skipped or timed out).
      if (!page) return response({ found: false, reason: "printed_page_not_found", ...x, verification: notFound("printed_page_not_found") });
      const p = await client.bookPage(x.book_id, page);
      const numbers = hadithNumbersWithEvidence(x.book_id, p);
      return response({
        found: true,
        ...p,
        hadith_numbers: numbers,
        hadith_numbers_source: numbers.length ? "page_markers" : "none",
        verification: verified("printed_page_mapping"),
      });
    },
  );

  return s;
}
