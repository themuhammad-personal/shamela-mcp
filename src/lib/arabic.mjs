/**
 * Pure Arabic / HTML-scraping helpers, extracted from the original
 * legacy worker bundle. No I/O, no globals — fully unit-testable.
 */

export const DEFAULT_BASE = "https://shamela.ws";

/** Strip HTML tags + decode common entities + collapse whitespace. */
export function clean(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, h, d) =>
      String.fromCodePoint(parseInt(h || d, h ? 16 : 10)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a site-relative href against the base. */
export function absolute(href, base = DEFAULT_BASE) {
  return href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Extract `<a>` elements whose class contains `classNeed` and href matches `path`. */
export function links(html, classNeed, path, base = DEFAULT_BASE) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    const cls = /class=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    if (cls.includes(classNeed) && path.test(href))
      out.push({ href: absolute(href, base), label: clean(m[2]) });
  }
  return out;
}

/** Extract book entries from a category/homepage/author HTML listing. */
export function booksFromHtml(html, category = "", base = DEFAULT_BASE) {
  const found = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = /href=["']([^"]*\/book\/(\d+))[^"']*["']/i.exec(m[1]);
    if (!href || !/book_title/i.test(`${m[1]} ${m[2]}`)) continue;
    const title = clean(m[2]);
    if (!title) continue;
    const nearby = html.slice(
      Math.max(0, m.index - 80),
      Math.min(html.length, m.index + m[0].length + 500),
    );
    const authorMatch = /<a[^>]*href=["'][^"']*\/author\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(nearby);
    found.push({
      book_id: href[2],
      id: href[2],
      title,
      author: authorMatch ? clean(authorMatch[2]) : "",
      author_id: authorMatch?.[1] || "",
      category,
      url: absolute(href[1], base),
    });
  }
  const seen = new Set();
  return found.filter((x) => !seen.has(x.book_id) && (seen.add(x.book_id), true));
}

/**
 * Arabic normalization: strip harakat/tatweel, fold hamza forms,
 * alef-maqsura → ya, ta-marbuta → ha, lowercase, collapse whitespace.
 */
export function normalizeArabic(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rank a book title against a query. Penalizes sharh/hashiya-type titles so
 * the primary text (e.g. Sahih al-Bukhari) outranks its commentaries
 * (e.g. Sharh al-Bukhari) when the query does not itself ask for a commentary.
 */
export function titleScore(title, query) {
  const t = normalizeArabic(title);
  const q = normalizeArabic(query);
  if (!q) return 0;
  let score =
    t === q ? 1000 : t.startsWith(q) ? 850 : t.includes(q) ? 650 : q.split(" ").filter((w) => t.includes(w)).length * 100;
  // NOTE: `\b` does NOT work with Arabic (Arabic letters are non-\w in JS), so
  // we match commentary terms as standalone/space-delimited tokens instead.
  const COMMENTARY = /(^|\s)(شرح|حاشي[ةه]|تعليق|تخريج|دراس[ةه])(\s|$)/;
  if (COMMENTARY.test(t) && !COMMENTARY.test(q)) score -= 180;
  return Math.max(0, score);
}
