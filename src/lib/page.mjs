/**
 * Structured parser for a shamela.ws book *page* (`/book/<id>/<page>`).
 *
 * Selectors cross-checked against a real page (test/fixtures/shamela-book-9904-page.html)
 * and four independent third-party scrapers (OpenShamela/shamela_crawler,
 * yshalsager/shamela2epub, farhan281/al-qalam-project, niloyahmedrasel/annotations-backend):
 *
 *   div.nass.margin-top-10 > p            main text, one <p> per paragraph
 *   p.hamesh (after <hr>)                 footnotes / apparatus — NOT main text
 *   a.btn_tag                             per-paragraph copy button (drop)
 *   span.anchor#pN                        paragraph anchors
 *   input#fld_part_top[value]             volume number
 *   input#fld_goto_top[value]             printed page number
 *   input#fld_specialNum_top[value]       hadith number (only on numbered books)
 *   div.size-12 span.text-black           chapter path (فهرس الكتاب › كتاب › باب)
 *   nav links after #fld_goto_top         next «>» and last «>>» page ids
 *   <title>                               «ج1 - ص6 - كتاب X - باب Y - المكتبة الشاملة»
 *   _book_id / _page_id in inline script
 */

import { clean } from "./arabic.mjs";

const decode = (s) => clean(s).replace(/\s+/g, " ").trim();

function attr(html, id, name = "value") {
  const re = new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  return new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;
}

/** Return whether the expected main-text container exists on a Shamela page. */
export function hasNassContainer(html) {
  return /<div\b[^>]*class=["'][^"']*\bnass\b[^"']*["'][^>]*>/i.test(String(html ?? ""));
}

/** Slice the inner HTML of the first `<div class="…nass…">` (balanced on nested divs). */
function nassInner(html) {
  const open = /<div\b[^>]*class=["'][^"']*\bnass\b[^"']*["'][^>]*>/i.exec(html);
  if (!open) return "";
  let i = open.index + open[0].length;
  let depth = 1;
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0].toLowerCase() === "<div" ? 1 : -1;
    if (depth === 0) return html.slice(i, m.index);
  }
  return html.slice(i);
}

/** Split `<p>…</p>` blocks; returns [{ html, cls }] in order. */
function paragraphs(inner) {
  const out = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(inner))) {
    const cls = /class=["']([^"']*)["']/i.exec(m[1])?.[1] ?? "";
    out.push({ html: m[2], cls });
  }
  return out;
}

/** Text of one paragraph: drop copy buttons, keep <br> as newlines, strip tags. */
const BR = "\u0000";
function paraText(html) {
  return html
    .replace(/<a\b[^>]*class=["'][^"']*btn_tag[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, BR)
    .split(BR)
    .map((l) => decode(l))
    .filter(Boolean)
    .join("\n");
}

/** Footnote text keeps <br> line breaks so «(١) …<br/>(٢) …» stays separable. */
const footnoteText = paraText;

/** Narrator identities must be captured before `clean()` removes their anchors. */
function narratorLinks(paras) {
  const seen = new Set();
  const out = [];
  let paragraph = -1;
  paras.forEach((para) => {
    if (/\bhamesh\b/.test(para.cls)) return;
    paragraph += 1;
    const re = /<a\b[^>]*href=["'](?:https?:\/\/shamela\.ws)?\/narrator\/(\d+)\/?[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
    let match;
    while ((match = re.exec(para.html))) {
      const narrator_id = match[1];
      if (seen.has(narrator_id)) continue;
      seen.add(narrator_id);
      out.push({ narrator_id, name: decode(match[2]), url: `https://shamela.ws/narrator/${narrator_id}`, paragraph });
    }
  });
  return out;
}

export function parseBookPage(html, { bookId = null, pageId = null } = {}) {
  const src = String(html ?? "");

  const inner = nassInner(src);
  const paras = paragraphs(inner);
  // Real pages always wrap text in <p>; if none are present (minimal/odd
  // markup) treat the whole block as one paragraph rather than dropping it.
  if (!paras.length && inner.trim()) paras.push({ html: inner, cls: "" });
  const main = paras.filter((p) => !/\bhamesh\b/.test(p.cls)).map((p) => paraText(p.html)).filter(Boolean);
  const footnotes = paras.filter((p) => /\bhamesh\b/.test(p.cls)).map((p) => footnoteText(p.html)).filter(Boolean);

  // Chapter path: فهرس الكتاب › (volume) › kitab › bab
  const pathBlock = /<div\b[^>]*class=["'][^"']*\bsize-12\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(src)?.[1] ?? "";
  const path = [];
  const pre = /<a\b[^>]*href=["']([^"']*)["'][^>]*>\s*<span\b[^>]*class=["'][^"']*text-black[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/gi;
  let pm;
  while ((pm = pre.exec(pathBlock))) {
    const title = decode(pm[2]);
    const pid = /\/book\/\d+\/(\d+)/.exec(pm[1])?.[1] ?? null;
    if (title && title !== "فهرس الكتاب") path.push({ title, page: pid });
  }

  const titleTag = decode(/<title>([\s\S]*?)<\/title>/i.exec(src)?.[1] ?? "");
  const tm = /^(?:ج(\d+)\s*-\s*)?ص(\d+)\s*-\s*(.*?)\s*-\s*المكتبة الشاملة$/.exec(titleTag);

  // Prev / next / last from the top nav bar (anchors right after #fld_goto_top).
  const navStart = src.search(/id=["']fld_goto_top["']/i);
  const navSlice = navStart >= 0 ? src.slice(navStart, navStart + 1500) : "";
  const navLinks = [...navSlice.matchAll(/<a\b[^>]*href=["'][^"']*\/book\/\d+\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/gi)].map((m) => ({
    page: m[1],
    label: decode(m[2]).replace(/\u00a0/g, "").trim(),
  }));
  const next = navLinks.find((l) => l.label === ">")?.page ?? null;
  const last = navLinks.find((l) => l.label === ">>")?.page ?? null;
  const preStart = navStart >= 0 ? src.slice(Math.max(0, navStart - 6000), navStart) : "";
  const prevLinks = [...preStart.matchAll(/<a\b[^>]*href=["'][^"']*\/book\/\d+\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/gi)].map((m) => ({
    page: m[1],
    label: decode(m[2]).replace(/\u00a0/g, "").trim(),
  }));
  const prev = prevLinks.find((l) => l.label === "<")?.page ?? null;

  const volume = attr(src, "fld_part_top");
  const printedPage = attr(src, "fld_goto_top");
  const specialNum = attr(src, "fld_specialNum_top");

  return {
    book_id: /_book_id\s*=\s*["'](\d+)["']/.exec(src)?.[1] ?? (bookId != null ? String(bookId) : null),
    page_id: /_page_id\s*=\s*["'](\d+)["']/.exec(src)?.[1] ?? (pageId != null ? String(pageId) : null),
    volume: volume ?? (tm?.[1] ?? null),
    printed_page: printedPage ?? (tm?.[2] ?? null),
    hadith_number_hint: specialNum && /^\d+$/.test(specialNum) ? specialNum : null,
    chapter_path: path,
    chapter: path.length ? path[path.length - 1].title : null,
    paragraphs: main,
    content: main.join("\n"),
    narrator_links: narratorLinks(paras),
    footnotes,
    nav: { prev, next, last },
    title_tag: titleTag || null,
  };
}
