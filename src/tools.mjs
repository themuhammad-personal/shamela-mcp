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
import { canonicalFields, canonicalMapStatus } from "./canonical-editions.mjs";
import { resolveHadith, resolveTafsirAyah, hadithNumbersOnPage, indexStatus } from "./lib/hadith-index.mjs";

const response = (x) => ({ content: [{ type: "text", text: JSON.stringify(x, null, 2) }] });

const idParam = z.string().regex(/^\d+$/);
const intId = z.coerce.string().regex(/^\d+$/);

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

/** Wrap a handler so failures are structured instead of opaque. */
function guarded(tool, handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const info = classifyError(err);
      return {
        ...response({
          ok: false,
          tool,
          error: info.kind,
          detail: info.message,
          ...(info.status ? { status: info.status } : {}),
          hint: info.hint,
          fabricated: false,
          note: "কোনো তথ্য অনুমান করা হয়নি — source থেকে কিছুই ফেরত দেওয়া হয়নি।",
        }),
        isError: true,
      };
    }
  };
}

export function createServer(client = createClient({ text: createHttp().text })) {
  const s = new McpServer({ name: "shamela-library", version: "2.2.0" });
  const tool = (name, description, schema, handler) => s.tool(name, description, schema, guarded(name, handler));

  tool("get_categories", "Shamela-র সম্পূর্ণ category তালিকা (id, নাম, বই সংখ্যা)।", {}, async () =>
    response({ items: await client.categories() }),
  );

  tool("get_books_by_category", "একটি category-র বই, page সহ।", { category_id: idParam, page: z.number().int().min(1).default(1) }, async (x) =>
    response(await client.booksByCategory(x.category_id, x.page)),
  );

  tool(
    "get_book_details",
    "বইয়ের title, author, metadata ও সূচিপত্র (TOC)। metadata-তে muhaqqiq (মুহাক্কিক) এবং canonical-edition তথ্যও থাকে — দেখুন is_canonical_numbering।",
    { book_id: idParam },
    async (x) => {
      const d = await client.details(x.book_id);
      return response({ ...d, ...canonicalFields({ book_id: d.book_id, title: d.title, muhaqqiq: d.metadata?.muhaqqiq }) });
    },
  );

  tool(
    "get_book_page",
    "বইয়ের নির্দিষ্ট Shamela page/node-এর আরবি টেক্সট। hadith_numbers ফিল্ডে এই পৃষ্ঠায় থাকা হাদিস নম্বরগুলোও থাকে (reverse lookup), যদি সূচি তৈরি থাকে।",
    { book_id: idParam, page_number: z.coerce.string().regex(/^\d+$/) },
    async (x) => {
      const p = await client.bookPage(x.book_id, x.page_number);
      return response({ ...p, hadith_numbers: hadithNumbersOnPage(x.book_id, x.page_number) });
    },
  );

  tool(
    "search_books_by_name",
    "Arabic-normalized, ranked বই-শিরোনাম সার্চ (book_id + pagination)। প্রতিটি ফলাফলে is_canonical_numbering ও canonical_edition থাকে। দ্রষ্টব্য: shamela.ws-এর আরবি corpus-এ কিছু উপমহাদেশীয় হানাফি/উর্দু-উৎস রচনা (যেমন معارف القرآن, بيان القرآن) নাও থাকতে পারে — ফলাফল না থাকা মানে রচনাটি 'অস্তিত্বহীন' নয়।",
    { query: z.string().min(2).max(200), page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(30).default(10) },
    async (x) => {
      const r = await client.titleSearch(x.query, x.page, x.limit);
      r.results = r.results.map((b) => ({ ...b, ...canonicalFields(b) }));
      return response(r);
    },
  );

  tool(
    "search_library",
    "Shamela native full-text search: any/all/exact-phrase, exclude_words, category ও century ফিল্টার, pagination। শতক (century) হিজরি, '-2' = জাহিলি যুগ। exclude_words শুধু ফেরত-আসা snippet-এ প্রযোয় (সম্পূর্ণ কর্পাস থেকে বাদ নয়)। ফলাফলে hadith_numbers/ayah রেফারেন্সও থাকে যদি সূচি তৈরি থাকে।",
    {
      query: z.string().min(1).max(250),
      match_mode: z.enum(["any_words", "all_words", "exact_phrase"]).default("any_words"),
      exclude_words: z.array(z.string().min(1).max(80)).max(10).optional(),
      categories: z.array(z.string().regex(/^\d+$/)).max(10).optional(),
      century: z.array(z.string().regex(/^-?\d+$/)).max(10).optional(),
      page: z.number().int().min(1).max(500).default(1),
    },
    async (x) => {
      const r = await client.searchLibrary(x.query, x.match_mode, x.exclude_words || [], x.categories || [], x.century || [], x.page);
      r.results = r.results.map((res) => {
        const hadith_numbers = hadithNumbersOnPage(res.book_id, res.page_id);
        return { ...res, hadith_numbers: hadith_numbers.length ? hadith_numbers : undefined };
      });
      return response(r);
    },
  );

  tool("get_author_books", "একজন লেখকের Shamela author page ও তার বই।", { author_id: idParam }, async (x) =>
    response(await client.authorBooks(x.author_id)),
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
    "একটি canonical হাদিস নম্বরকে বইয়ের page/node-এ রূপান্তর করে matn (ও isnad, থাকলে) ফেরত দেয় — পৃষ্ঠা অনুমান না করে। ভিত্তি: scripts/build-hadith-index.mjs-এ তৈরি সূচি। সূচি না থাকলে found:false + reason ফেরত, কখনো নম্বর বানানো হয় না।",
    { book_id: idParam, hadith_number: intId },
    async (x) => {
      const res = resolveHadith(x.book_id, x.hadith_number);
      if (!res.found)
        return response({
          ...res,
          book_id: x.book_id,
          index_status: indexStatus(),
          canonical_map: canonicalMapStatus(),
          hint: "সূচি তৈরি হয়নি — 'Refresh citation index' workflow (অথবা নেটওয়ার্কসহ scripts/build-hadith-index.mjs) চালান।",
        });
      const page = await client.bookPage(res.book_id, res.page);
      return response({
        found: true,
        book_id: res.book_id,
        hadith_number: res.hadith_number,
        page: res.page,
        book_title: page.book_title,
        author: page.author,
        matn: page.content,
        isnad_present: /حدثنا|أخبرنا|أنبأنا/.test(page.content),
        citation: { book_id: res.book_id, hadith_number: res.hadith_number, page: res.page, note: res.note },
      });
    },
  );

  // --- Priority 2: ayah-addressable tafsir retrieval ---
  tool(
    "get_tafsir_by_ayah",
    "একটি Shamela তাফসির বই (Ibn Kathir, Qurtubi, Tabari ইত্যাদি) ও ayah রেফারেন্স (surah, ayah) দিলে সেই আয়াহ-সংক্রান্ত আলোচনার প্যাসেজ ফেরত দেয় — সূচিপত্র হেঁটে পৃষ্ঠা অনুমান ছাড়াই। ভিত্তি: scripts/build-hadith-index.mjs-এ তৈরি সূচি।",
    { book_id: idParam, surah: z.number().int().min(1).max(114), ayah: z.number().int().min(1) },
    async (x) => {
      const res = resolveTafsirAyah(x.book_id, x.surah, x.ayah);
      if (!res.found)
        return response({
          ...res,
          book_id: x.book_id,
          index_status: indexStatus(),
          hint: "তাফসির সূচি তৈরি হয়নি — 'Refresh citation index' workflow (অথবা নেটওয়ার্কসহ scripts/build-hadith-index.mjs) চালান।",
        });
      const page = await client.bookPage(res.book_id, res.page);
      return response({
        found: true,
        book_id: res.book_id,
        surah: res.surah,
        ayah: res.ayah,
        page: res.page,
        book_title: page.book_title,
        passage: page.content,
        citation: { book_id: res.book_id, surah: res.surah, ayah: res.ayah, page: res.page, note: res.note },
      });
    },
  );

  return s;
}
