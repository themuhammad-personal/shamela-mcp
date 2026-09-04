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
import { detectHadithNumbers, extractHadith, detectAyahs, gradingAcrossPages } from "./lib/citation-detect.mjs";
import { normalizeArabic } from "./lib/arabic.mjs";

export const SERVER_VERSION = "2.4.0";

const response = (x) => ({ content: [{ type: "text", text: JSON.stringify(x, null, 2) }] });

// Keep the upstream cache, concurrency gate, in-flight de-duplication and
// details cache alive for the lifetime of a Worker isolate. A new MCP server
// and transport is still created per stateless HTTP request, but the expensive
// upstream state must not be recreated with them.
const sharedHttp = createHttp();
const sharedClient = createClient({ text: sharedHttp.text });

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

export function createServer(client = sharedClient) {
  const s = new McpServer({ name: "shamela-library", version: SERVER_VERSION });
  // `registerTool` is the non-deprecated API in SDK ≥1.30 (`tool()` is @deprecated).
  const tool = (name, description, schema, handler) =>
    s.registerTool(name, { description, inputSchema: schema }, guarded(name, handler));

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
      const d = await client.details(x.book_id);
      return response({ ...d, ...canonicalFields({ book_id: d.book_id, title: d.title, muhaqqiq: d.metadata?.muhaqqiq }) });
    },
  );

  tool(
    "get_book_page",
    "বইয়ের নির্দিষ্ট Shamela page/node-এর আরবি টেক্সট — paragraphs, footnotes (hamesh) আলাদা, volume/printed_page, chapter_path, prev/next nav সহ। hadith_numbers = এই পৃষ্ঠার অনুচ্ছেদ-শুরুতে ছাপা হাদিস নম্বর (footnote বাদ); ayah_refs = পৃষ্ঠায় স্পষ্টভাবে উল্লিখিত [সূরা: আয়াত] রেফারেন্স।",
    { book_id: idParam, page_number: z.coerce.string().regex(/^\d+$/) },
    async (x) => {
      const p = await client.bookPage(x.book_id, x.page_number);
      const onPage = detectHadithNumbers(p.paragraphs);
      const indexed = hadithNumbersOnPage(x.book_id, x.page_number);
      return response({
        ...p,
        hadith_numbers: onPage.length ? onPage : indexed,
        hadith_numbers_source: onPage.length ? "page_markers" : indexed.length ? "static_index" : "none",
        ayah_refs: detectAyahs(p.paragraphs),
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
      categories: z.array(z.string().regex(/^\d+$/)).max(10).optional(),
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
    "হাদিস রাবীর তরজমা (رجال card): shamela.ws/narrator/<id> — সনদের প্রতিটি নামে এই লিংক থাকে (get_book_page / get_hadith_by_number-এর isnad-এ)। ফেরত: নাম, লকব, কুনিয়া, নসব, আকীদা, জন্ম/মৃত্যু (হিজরি সংখ্যাসহ), তাকরীবের তবকা, ইবনে হাজার ও যাহাবীর রুতবা (Shamela যা ছাপে, হুবহু উদ্ধৃত), এবং «الجرح والتعديل» তালিকা — প্রতিটি নাকিদের নামে তার উক্তি + উৎস (যেমন [تهذيب التهذيب (3/ 28)])। কোনো গণনাকৃত 'reliability' নেই; শুধু উদ্ধৃত ও attributed উক্তি।",
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
        // fall back to the indexed page even if live verification was unavailable
        const page = await client.bookPage(cached.book_id, cached.page);
        return response({ ...formatHadith({ ...cached, text: page.content, page_data: page, spans_pages: [cached.page] }, canon), verified_on_page: false });
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
    // Editorial grading: ONLY an explicit «[حكم الألباني] : …» / «قال الألباني: …»
    // in the apparatus of the page(s) this hadith is printed on; attributed to
    // this hadith only when unambiguous. Tirmidhi's own «حسن صحيح» in the matn is
    // never reported as a grading.
    const pages = r.pages ?? [{ page: r.page, footnotes: pd.footnotes ?? [], paragraphs: pd.paragraphs ?? [], numbers: r.numbers_on_page ?? detectHadithNumbers(pd.paragraphs ?? []) }];
    const g = gradingAcrossPages(pages, r.hadith_number);
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
      // Real pages are fully vocalised («حَدَّثَنَا»), so strip harakat first.
      isnad_present: /حدثنا|اخبرنا|انبانا|حدثني|اخبرني|سمعت/.test(normalizeArabic(r.text ?? "")),
      routes_on_page: r.routes_on_page,
      other_numbers_on_page: r.numbers_on_page,
      footnotes: pd.footnotes?.length ? pd.footnotes : undefined,
      grading: g.grading,
      gradings_on_page: g.gradings_on_page.length ? g.gradings_on_page : undefined,
      grading_note: g.grading_note,
      source: r.source,
      verified_on_page: r.source !== "static_index",
      ...canon,
      citation: {
        book_id: r.book_id,
        edition: canonicalRecord(r.book_id)?.title ?? pd.book_title,
        numbering: canonicalRecord(r.book_id)?.numbering ?? null,
        hadith_number: r.hadith_number,
        volume: pd.volume,
        printed_page: pd.printed_page,
        page: r.page,
        url: pd.url,
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
      if (!res.found)
        return response({
          ...res,
          book_id: x.book_id,
          index_status: indexStatus(),
          ...canonicalFields({ book_id: x.book_id }),
          hint:
            res.reason === "no_tafsir_index_for_book"
              ? "এই book_id-র জন্য persisted তাফসির সূচি নেই (বর্তমানে: ইবনে কাসীর 8473, তাবারী 7798, কুরতুবী 20855)। scripts/build-tafsir-index.mjs --tafsir <id> চালিয়ে সূচি তৈরি করুন, অথবা get_book_details → get_book_page ব্যবহার করুন।"
              : "get_book_details দিয়ে TOC দেখে get_book_page ব্যবহার করুন।",
        });
      const page = await client.bookPage(res.book_id, res.page);
      return response({
        found: true,
        book_id: res.book_id,
        surah: res.surah,
        ayah: res.ayah,
        page: res.page,
        precision: res.precision,
        source: res.source,
        note: res.note,
        surah_range: res.surah_range,
        pages_fetched: res.pages_fetched,
        ayahs_marked_on_page: res.ayahs_marked_on_page,
        book_title: page.book_title,
        volume: page.volume,
        printed_page: page.printed_page,
        chapter_path: page.chapter_path,
        passage: page.content,
        footnotes: page.footnotes?.length ? page.footnotes : undefined,
        nav: page.nav,
        ...canonicalFields({ book_id: res.book_id }),
        citation: { book_id: res.book_id, surah: res.surah, ayah: res.ayah, volume: page.volume, printed_page: page.printed_page, page: res.page, url: page.url },
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
    "ছাপা সংস্করণের (জুয/খণ্ড, পৃষ্ঠা) → Shamela page। Shamela-র /ajax/pagenum2id ব্যবহার করে; 'ترقيم الكتاب موافق للمطبوع' বইতে নির্ভরযোগ্য। না মিললে found:false।",
    { book_id: idParam, volume: z.coerce.string().regex(/^\d+$/), printed_page: z.coerce.string().regex(/^\d+$/) },
    async (x) => {
      const page = await client.printedPageId(x.book_id, x.volume, x.printed_page);
      if (!page) return response({ found: false, reason: "printed_page_not_found", ...x });
      const p = await client.bookPage(x.book_id, page);
      return response({ found: true, ...p, hadith_numbers: detectHadithNumbers(p.paragraphs) });
    },
  );

  return s;
}
