/**
 * shamela.ws scraping client. All functions receive an injected `text()` (see http.mjs) so they
 * are testable offline with fixture HTML.
 */

import { clean, absolute, links, booksFromHtml, normalizeArabic, titleScore, DEFAULT_BASE } from "./arabic.mjs";
import { hasNassContainer, parseBookPage } from "./page.mjs";
import { parseAuthorBiography, parseNarratorTarjama } from "./tarjama.mjs";

export function createClient({ base = DEFAULT_BASE, text, maxCachedDetails = 200 }) {
  /**
   * `bookPage()` needs the book's title/author, which live on the *details*
   * page. Without this cache every single page read costs two upstream
   * requests — and the index builder reads hundreds of pages, so that doubling
   * is exactly the kind of load we must not put on shamela.ws (Roadmap 0.4).
   * Bounded Map, per isolate; titles/metadata don't change under us.
   */
  const detailsCache = new Map();
  const detailsInflight = new Map();

  const unusable = (message) => {
    const error = new Error(`Shamela returned an unusable page: ${message}`);
    error.code = "SHAMELA_INVALID_BODY";
    return error;
  };

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

  async function categoryPage(category, page) {
    const categoryId = String(category.id);
    const all = booksFromHtml(await text(`${base}/category/${categoryId}`), category.name || "", base);
    const size = 50;
    const start = (page - 1) * size;
    return {
      category_id: categoryId,
      category: category.name || "",
      page,
      books: all.slice(start, start + size),
      has_next: start + size < all.length,
      total_available: all.length,
    };
  }

  async function booksByCategory(categoryId, page) {
    const cats = await categories();
    return categoryPage(cats.find((c) => c.id === String(categoryId)) ?? { id: categoryId, name: "" }, page);
  }

  async function details(bookId) {
    const key = String(bookId);
    if (detailsCache.has(key)) return detailsCache.get(key);
    if (detailsInflight.has(key)) return detailsInflight.get(key);

    const pending = (async () => {
      const result = await fetchDetails(bookId);
      if (maxCachedDetails > 0) {
        if (detailsCache.size >= maxCachedDetails) detailsCache.delete(detailsCache.keys().next().value);
        detailsCache.set(key, result);
      }
      return result;
    })();
    detailsInflight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (detailsInflight.get(key) === pending) detailsInflight.delete(key);
    }
  }

  /** Uncached details fetch — used by the cache miss path above. */
  async function fetchDetails(bookId) {
    const html = String(await text(`${base}/book/${bookId}`) ?? "");
    const title = clean(/<h1[^>]*class="[^"]*size-20[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(html)?.[1] || "");
    const hasBookShell = title || /<h1\b|<div\b[^>]*class=["'][^"']*\bnass\b|betaka-index|line-height\s*:\s*1\.8|\/author\/\d+/i.test(html);
    if (!hasBookShell) throw unusable(`unusable book details for book ${bookId}`);
    const am = /href="[^"]*\/author\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
    const toc = links(html, "", new RegExp(`/book/${bookId}/\\d+`), base).filter((x) => !x.href.includes("javascript"));
    // The "بطاقة الكتاب" block. Legacy markup wraps it in an inline-styled div;
    // fall back to the text that precedes `div.betaka-index` inside `.nass`
    // (the layout every third-party scraper relies on).
    const styled = /<div style="line-height: 1\.8;">([\s\S]*?)<\/div>/i.exec(html)?.[1];
    const beforeIndex = /<div[^>]*class="[^"]*\bnass\b[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*betaka-index/i.exec(html)?.[1];
    const body = clean((styled || beforeIndex || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n"));
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
        parts: /(?:عدد الأجزاء)[:：]\s*([^\s]+)/.exec(body)?.[1] || "",
        // "ترقيم الكتاب موافق للمطبوع" — page numbers match the printed edition.
        pagination_matches_print: /ترقيم الكتاب موافق للمطبوع/.test(body),
        // "وهو ضمن خدمة التخريج" — shamela wires this edition into hadith-number lookup.
        hadith_numbering_service: /ضمن خدمة التخريج/.test(body),
      },
      url: `${base}/book/${bookId}`,
    };
  }

  async function bookPage(bookId, pageNumber) {
    const html = String(await text(`${base}/book/${bookId}/${pageNumber}`) ?? "");
    if (!hasNassContainer(html)) throw unusable(`missing div.nass on book ${bookId} page ${pageNumber}`);
    const d = await details(bookId);
    const p = parseBookPage(html, { bookId, pageId: pageNumber });
    return {
      book_id: String(bookId),
      page_number: String(pageNumber),
      content: p.content,
      paragraphs: p.paragraphs,
      footnotes: p.footnotes,
      volume: p.volume,
      printed_page: p.printed_page,
      chapter: p.chapter,
      chapter_path: p.chapter_path,
      hadith_number_hint: p.hadith_number_hint,
      nav: p.nav,
      book_title: d.title,
      author: d.author,
      url: `${base}/book/${bookId}/${pageNumber}`,
    };
  }

  /**
   * shamela's own "رقم الحديث / الرقم المسلسل" lookup:
   *   GET /ajax/specialnumber2id/<book_id>/<n>  →  page id (plain text), or a
   *   negative number when the book has no numbering / n is not found.
   * Verified live for 1681, 1727, 1726, 1435, 829, 1198, 1699, 25794.
   * NOTE: for n beyond the last hadith shamela returns the LAST page rather
   * than -1, so callers must confirm the marker is actually on the page.
   */
  async function hadithPageId(bookId, hadithNumber) {
    const raw = await text(`${base}/ajax/specialnumber2id/${bookId}/${hadithNumber}`, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "text/plain, */*" },
    });
    const v = String(raw).trim();
    if (!/^-?\d+$/.test(v)) throw new Error(`specialnumber2id: unexpected response "${v.slice(0, 40)}"`);
    const n = Number(v);
    return n > 0 ? String(n) : null;
  }

  /** GET /ajax/pagenum2id/<book_id>/<part>/<printed_page> → page id or null. */
  async function printedPageId(bookId, part, printedPage) {
    const raw = await text(`${base}/ajax/pagenum2id/${bookId}/${part}/${printedPage}`, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "text/plain, */*" },
    });
    const v = String(raw).trim();
    if (!/^-?\d+$/.test(v)) throw new Error(`pagenum2id: unexpected response "${v.slice(0, 40)}"`);
    const n = Number(v);
    return n > 0 ? String(n) : null;
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
    // Roadmap 3.3: the author page also carries a «تعريف بالمؤلف» dictionary entry.
    const biography = parseAuthorBiography(html);
    return {
      author_id: authorId,
      author: name,
      url: `${base}/author/${authorId}`,
      books,
      total_available: books.length,
      biography: biography.found ? biography : null,
      biography_status: biography.found ? "found" : biography.reason,
    };
  }

  /**
   * Rijal card for a hadith narrator — the `/narrator/<id>` links that shamela
   * puts on every isnad name (`ajax/tarjama/<id>` serves the same fragment).
   */
  async function narratorTarjama(narratorId) {
    const url = `${base}/narrator/${narratorId}`;
    const html = await text(url);
    const h1 = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || "");
    const parsed = parseNarratorTarjama(html);
    return { narrator_id: String(narratorId), url, heading: h1 || null, ...parsed };
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
    const seen = new Set();
    const scanned = [];
    for (const c of cats) {
      if (out.length >= limit) break;
      const x = await categoryPage(c, 1);
      scanned.push(c.id);
      for (const book of x.books) {
        if (seen.has(book.book_id)) continue;
        seen.add(book.book_id);
        out.push(book);
        if (out.length >= limit) break;
      }
    }
    const books = out.slice(0, limit);
    return {
      books,
      count: books.length,
      categories_scanned: scanned,
    };
  }

  return {
    categories,
    booksByCategory,
    details,
    bookPage,
    hadithPageId,
    printedPageId,
    titleSearch,
    searchLibrary,
    authorBooks,
    narratorTarjama,
    recent,
    allBooks,
  };
}
