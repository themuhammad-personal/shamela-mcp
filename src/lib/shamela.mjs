/**
 * shamela.ws scraping client, extracted from the original `src/worker.mjs`
 * bundle. All functions receive an injected `text()` (see http.mjs) so they
 * are testable offline with fixture HTML.
 */

import { clean, absolute, links, booksFromHtml, normalizeArabic, titleScore, DEFAULT_BASE } from "./arabic.mjs";

export function createClient({ base = DEFAULT_BASE, text, maxCachedDetails = 200 }) {
  /**
   * `bookPage()` needs the book's title/author, which live on the *details*
   * page. Without this cache every single page read costs two upstream
   * requests — and the index builder reads hundreds of pages, so that doubling
   * is exactly the kind of load we must not put on shamela.ws (Roadmap 0.4).
   * Bounded Map, per isolate; titles/metadata don't change under us.
   */
  const detailsCache = new Map();

  async function categories() {
    const html = await text(`${base}/`);
    const cats = links(html, "cat_title", /\/category\/(\d+)/, base);
    return cats.map((x) => {
      const id = /\/category\/(\d+)/.exec(x.href)?.[1] || "";
      const label = x.label.replace(/^\d+\.\s*/, "");
      const m = /^(.*?)(?:\s+(\d+))?$/.exec(label);
      return { id, name: m?.[1]?.trim() || label, book_count: m?.[2] ? Number(m[2]) : null, url: x.href };
    });
  }

  async function booksByCategory(categoryId, page) {
    const cats = await categories();
    const category = cats.find((c) => c.id === categoryId)?.name || "";
    const all = booksFromHtml(await text(`${base}/category/${categoryId}`), category, base);
    const size = 50;
    const start = (page - 1) * size;
    return {
      category_id: categoryId,
      category,
      page,
      books: all.slice(start, start + size),
      has_next: start + size < all.length,
      total_available: all.length,
    };
  }

  async function details(bookId) {
    const cached = detailsCache.get(String(bookId));
    if (cached) return cached;
    const result = await fetchDetails(bookId);
    if (detailsCache.size >= maxCachedDetails) detailsCache.delete(detailsCache.keys().next().value);
    detailsCache.set(String(bookId), result);
    return result;
  }

  /** Uncached details fetch — used by the cache miss path above. */
  async function fetchDetails(bookId) {
    const html = await text(`${base}/book/${bookId}`);
    const title = clean(/<h1[^>]*class="[^"]*size-20[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(html)?.[1] || "");
    const am = /href="[^"]*\/author\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
    const toc = links(html, "", new RegExp(`/book/${bookId}/\\d+`), base).filter((x) => !x.href.includes("javascript"));
    const body = clean(/<div style="line-height: 1\.8;">([\s\S]*?)<\/div>/i.exec(html)?.[1] || "");
    const field = (name) =>
      new RegExp(
        `${name}[:：]\\s*([^\n]+?)(?=(?:الكتاب|المؤلف|المحقق|الناشر|الطبعة|عدد الصفحات|عدد)[：:]|$)`,
      ).exec(body)?.[1]?.trim() || "";
    const categoryMatch = /href=["'][^"']*\/category\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(html);
    return {
      id: bookId,
      book_id: bookId,
      title,
      author: am ? clean(am[2]) : "",
      author_id: am?.[1] || "",
      category: categoryMatch ? clean(categoryMatch[2]) : "",
      category_id: categoryMatch?.[1] || "",
      toc: toc.slice(0, 400).map((x) => ({ title: x.label, href: x.href })),
      metadata: {
        publisher: field("الناشر"),
        edition: field("الطبعة"),
        muhaqqiq: field("المحقق") || field("تحقيق"),
        page_count: /(?:عدد الصفحات)[:：]\s*([^\s]+)/.exec(body)?.[1] || "",
      },
      url: `${base}/book/${bookId}`,
    };
  }

  async function bookPage(bookId, pageNumber) {
    const html = await text(`${base}/book/${bookId}/${pageNumber}`);
    const d = await details(bookId);
    const m = /<div[^>]*class="[^"]*nass[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/i.exec(html);
    return {
      book_id: bookId,
      page_number: pageNumber,
      content: clean(m?.[1] || ""),
      book_title: d.title,
      author: d.author,
      url: `${base}/book/${bookId}/${pageNumber}`,
    };
  }

  async function titleSearch(query, page, limit) {
    const normalizedQuery = normalizeArabic(query);
    const raw = await text(`${base}/ajax/book/?term=${encodeURIComponent(normalizedQuery || query)}`);
    let items = [];
    try {
      items = JSON.parse(raw).results?.items || [];
    } catch {
      /* non-JSON response — fall through to homepage scrape below */
    }
    let results = items.map((x) => ({
      book_id: String(x.id),
      id: String(x.id),
      title: clean(x.text || ""),
      url: `${base}/book/${x.id}`,
    }));
    if (!results.length) {
      const all = booksFromHtml(await text(`${base}/`), "", base);
      results = all.filter((b) => normalizeArabic(b.title).includes(normalizedQuery));
    }
    const ranked = results
      .map((x) => ({
        ...x,
        score: titleScore(x.title, query),
        match:
          normalizeArabic(x.title) === normalizedQuery
            ? "exact_normalized"
            : normalizeArabic(x.title).startsWith(normalizedQuery)
              ? "prefix_normalized"
              : "partial_normalized",
      }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ar"));
    const start = (page - 1) * limit;
    return {
      query,
      normalized_query: normalizedQuery,
      page,
      limit,
      results: ranked.slice(start, start + limit),
      total_available: ranked.length,
      has_next: start + limit < ranked.length,
      source: "/ajax/book/?term=",
    };
  }

  function makeTerm(query, mode) {
    const q = query.trim();
    return mode === "exact_phrase"
      ? `"${q.replaceAll('"', "")}"`
      : mode === "all_words"
        ? q.split(/\s+/).map((x) => `+${x}`).join(" ")
        : q;
  }

  async function searchLibrary(query, mode, excluded, cats, centuries, page) {
    const form = new URLSearchParams();
    form.set("term", makeTerm(query, mode));
    form.set("page", String(page));
    for (const c of cats.length ? cats : ["-1"]) form.append("aqsam[]", c);
    for (const c of centuries.length ? centuries : ["-1"]) form.append("decades[]", c);
    form.append("authors[]", "-1");
    form.append("books[]", "-1");
    const html = await text(`${base}/ajax/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form.toString(),
    });
    const re =
      /<div>\s*<a[^>]*href="([^"]*\/book\/(\d+)\/(\d+))"[^>]*>[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>\s*<span[^>]*>\[([\s\S]*?)\]<\/span>[\s\S]*?<p class="srch-snippet">([\s\S]*?)<\/p>/gi;
    const results = [];
    let m;
    while ((m = re.exec(html)))
      results.push({
        title: clean(m[4]),
        author: clean(m[5]),
        url: absolute(m[1], base),
        snippet: clean(m[6]),
        book_id: m[2],
        page_id: m[3],
      });
    const total = /النتائج\s+\d+\s+إلى\s+\d+\s+من\s+([\d,]+)/.exec(clean(html))?.[1] || "";
    const next = /id="bu_srch_more"[^>]*data-page="(\d+)"/.exec(html)?.[1];
    const excludedResults = excluded.length
      ? results.filter((r) => !excluded.some((word) => r.snippet.includes(word.trim())))
      : results;
    return {
      query,
      rendered_query: form.get("term"),
      page,
      results: excludedResults,
      total_results: total,
      has_next: !!next,
      next_page: next ? Number(next) : null,
      filters: {
        categories: cats,
        century: centuries,
        exclude_words: excluded,
        exclusion_applied_to: "returned snippets",
      },
    };
  }

  async function authorBooks(authorId) {
    const html = await text(`${base}/author/${authorId}`);
    const name = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || "");
    const books = booksFromHtml(html, "", base).map((b) => ({
      ...b,
      author: b.author || name,
      author_id: b.author_id || authorId,
    }));
    return { author_id: authorId, author: name, books, total_available: books.length };
  }

  async function recent() {
    const html = await text(`${base}/`);
    const initial = booksFromHtml(html, "", base).slice(0,20);
    const books = await Promise.all(
      initial.map(async (b) => {
        try {
          const d = await details(b.book_id);
          return { ...b, category: d.category, category_id: d.category_id };
        } catch {
          return { ...b, category: b.category || "غير متاح", category_id: "" };
        }
      }),
    );
    return { books, total_available: books.length, category_source: "canonical book breadcrumb" };
  }

  async function allBooks(limit) {
    const cats = await categories();
    const out = [];
    for (const c of cats) {
      if (out.length >= limit) break;
      const x = await booksByCategory(c.id, 1);
      out.push(...x.books);
    }
    return {
      books: out.slice(0, limit),
      count: Math.min(out.length, limit),
      categories_scanned: cats.slice(0, Math.max(1, Math.ceil(out.length / 50))).map((c) => c.id),
    };
  }

  return {
    categories,
    booksByCategory,
    details,
    bookPage,
    titleSearch,
    searchLibrary,
    authorBooks,
    recent,
    allBooks,
  };
}
