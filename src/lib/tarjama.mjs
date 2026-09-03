/**
 * Tarjamah (biography) parsers — Roadmap 3.3.
 *
 * Two different shamela.ws pages carry biographical data:
 *
 *   /author/<id>  (also linked from every book card)
 *     …books… then «تعريف بالمؤلف» followed by an entry copied from a
 *     classical biographical dictionary (usually «الأعلام» للزركلي), e.g.
 *       البُخاري (١٩٤ - ٢٥٦ هـ = ٨١٠ - ٨٧٠ م)
 *       محمد بن إسماعيل بن إبراهيم بن المغيرة البخاري، أبو عبد الله
 *       • حبر الإسلام، والحافظ لحديث رسول الله …
 *       صاحب:
 *       • (الجامع الصحيح - ط) المعروف بصحيح البخاري
 *       _________
 *       (١) تذكرة الحفاظ ٢: ١٢٢ و…
 *       نقلا عن: «الأعلام» للزركلي
 *
 *   /narrator/<id>  ==  /ajax/tarjama/<id>  (the page is the fragment + chrome)
 *     Rijal card for a hadith narrator (isnad names on hadith pages link here):
 *       الاسم: …   اللقب: …   الكنية: …   النسب: …   المذهب العقدي: …
 *       تاريخ الميلاد: 128 هـ   تاريخ الوفاة: 212 هـ أو 213 هـ …
 *       طبقة رواة التقريب: …   الرتبة عند ابن حجر: …   الرتبة عند الذهبي: …
 *       الجرح والتعديل:
 *         <critic name>
 *         <statement> [<source book (vol/ page)>]
 *         …
 *
 * Both parsers work on TEXT LINES derived from the HTML, never on specific
 * class names, because these pages have no stable selectors. Rule: report
 * only what is printed, attributed to the critic and source shamela prints —
 * never a computed "reliability".
 */

import { clean } from "./arabic.mjs";
import { toLatinDigits } from "./citation-detect.mjs";

const NL = "\u0000";

/** HTML → trimmed non-empty text lines (block boundaries and <br> become line breaks). */
export function htmlToLines(html) {
  return String(html ?? "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, NL)
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article|td|th)\s*>/gi, NL)
    .replace(/<(?:p|div|h[1-6]|li|tr|blockquote|section|article)\b[^>]*>/gi, NL)
    .split(NL)
    .map((l) => clean(l))
    .filter(Boolean);
}

const num = (s) => {
  const m = /\d{1,4}/.exec(toLatinDigits(String(s ?? "")));
  return m ? Number(m[0]) : null;
};
const allNums = (s) => [...toLatinDigits(String(s ?? "")).matchAll(/\d{1,4}/g)].map((m) => Number(m[0]));

// ---------------------------------------------------------------------------
// Narrator (rijal) card
// ---------------------------------------------------------------------------

/** Arabic label → stable English key for the well-known fields. Unknown labels are kept under `fields`. */
const NARRATOR_KEYS = {
  الاسم: "name",
  اللقب: "laqab",
  الكنية: "kunya",
  النسب: "nasab",
  "علاقات الراوي": "affiliations",
  "المذهب العقدي": "creed",
  "المذهب الفقهي": "madhhab",
  "تاريخ الميلاد": "born",
  "تاريخ الوفاة": "died",
  "بلد الميلاد": "birth_place",
  "بلد الوفاة": "death_place",
  "بلد الإقامة": "residence",
  "بلد الرحلة": "travelled_to",
  "طبقة رواة التقريب": "tabaqa_taqrib",
  "الرتبة عند ابن حجر": "rank_ibn_hajar",
  "الرتبة عند الذهبي": "rank_dhahabi",
};

const JARH_HEADING_RE = /^\s*(?:####\s*)?الجرح\s+والتعديل\s*[:：]?\s*$/;
const FIELD_RE = /^([^:：]{2,40}?)\s*[:：]\s*(.*)$/;
const SOURCED_RE = /^(.*?)\s*\[([^[\]]{3,120})\]\s*[.。]?\s*$/;

/**
 * @param {string} html  /narrator/<id> page or /ajax/tarjama/<id> fragment
 * @returns {{ found: boolean, name?: string, fields: object, jarh_wa_tadil: {critic, statements:[{text, source}]}[] , … }}
 */
export function parseNarratorTarjama(html) {
  const lines = htmlToLines(html);
  const fields = {};
  const raw = {};
  const jarh = [];
  let inJarh = false;
  let current = null;
  let statementCount = 0;

  for (const line of lines) {
    if (!inJarh) {
      if (JARH_HEADING_RE.test(line)) {
        inJarh = true;
        continue;
      }
      const m = FIELD_RE.exec(line);
      if (!m) continue;
      const label = m[1].trim();
      const value = m[2].trim();
      if (!value) continue;
      raw[label] = value;
      const key = NARRATOR_KEYS[label];
      if (key) fields[key] = value;
      continue;
    }
    // Inside the جرح والتعديل list.
    const s = SOURCED_RE.exec(line);
    if (s && s[1].trim()) {
      if (!current) {
        current = { critic: null, statements: [] };
        jarh.push(current);
      }
      current.statements.push({ text: s[1].trim(), source: s[2].trim() });
      statementCount += 1;
      continue;
    }
    // A short line without a trailing [source] is the next critic's name.
    if (line.length <= 60 && !/[.،:؛]$/.test(line)) {
      // Footer chrome ends the list.
      if (/^(?:حول المشروع|اتصل بنا|المكتبة الشاملة|إغلاق|الرئيسية|فهرس الرواة)$/.test(line)) break;
      current = { critic: line, statements: [] };
      jarh.push(current);
    }
  }
  const groups = jarh.filter((g) => g.statements.length);

  if (!fields.name && !groups.length) return { found: false, reason: "no_tarjama_content", fields: raw, jarh_wa_tadil: [] };

  const bornYears = allNums(fields.born).filter((y) => y > 0 && y < 1500);
  const diedYears = allNums(fields.died).filter((y) => y > 0 && y < 1500);
  return {
    found: true,
    name: fields.name ?? null,
    laqab: fields.laqab ?? null,
    kunya: fields.kunya ?? null,
    nasab: fields.nasab ?? null,
    creed: fields.creed ?? null,
    madhhab: fields.madhhab ?? null,
    born: fields.born ?? null,
    born_hijri: bornYears[0] ?? null,
    died: fields.died ?? null,
    died_hijri: diedYears[0] ?? null,
    died_hijri_candidates: diedYears.length > 1 ? diedYears : undefined,
    death_place: fields.death_place ?? null,
    travelled_to: fields.travelled_to ?? null,
    tabaqa_taqrib: fields.tabaqa_taqrib ?? null,
    // The two summary verdicts shamela prints — quoted, attributed, not computed.
    rank_ibn_hajar: fields.rank_ibn_hajar ?? null,
    rank_dhahabi: fields.rank_dhahabi ?? null,
    fields: raw,
    critics: groups.map((g) => g.critic).filter(Boolean),
    jarh_wa_tadil: groups,
    statement_count: statementCount,
  };
}

// ---------------------------------------------------------------------------
// Author page «تعريف بالمؤلف»
// ---------------------------------------------------------------------------

const BIO_HEADING_RE = /^\s*(?:####\s*)?تعريف\s+بالمؤلف\s*[:：]?\s*$/;
const FOOTER_RE = /^(?:حول المشروع|اتصل بنا|الموقع القديم|المكتبة الشاملة|إغلاق|×|نبذة عن المشروع:?|تنزيل المكتبة الشاملة)$/;
const RULE_RE = /^_{3,}\s*$/;
const SOURCE_RE = /^نقل(?:ا|اً)\s+عن\s*[:：]?\s*(.+)$/;

/**
 * Dates from a dictionary headline such as
 *   «البُخاري (١٩٤ - ٢٥٦ هـ = ٨١٠ - ٨٧٠ م)»   «فلان (ت ٢٥٦ هـ)»   «فلان (٠٠٠ - ٧٥١ هـ)»
 */
export function datesFromHeadline(headline) {
  const t = toLatinDigits(String(headline ?? ""));
  const out = { born_hijri: null, died_hijri: null, born_ce: null, died_ce: null };
  const hij = /\(\s*(?:ت\s*)?(\d{1,4}|0{3})?\s*(?:-\s*(\d{1,4}))?\s*هـ/.exec(t);
  if (hij) {
    if (hij[2]) {
      out.born_hijri = hij[1] && !/^0+$/.test(hij[1]) ? Number(hij[1]) : null;
      out.died_hijri = Number(hij[2]);
    } else if (hij[1]) {
      // «(ت ٢٥٦ هـ)» or a lone year → death year (dictionaries head with death when birth is unknown)
      out.died_hijri = /^0+$/.test(hij[1]) ? null : Number(hij[1]);
    }
  }
  const ce = /=\s*(\d{3,4}|0{3})?\s*(?:-\s*(\d{3,4}))?\s*م/.exec(t);
  if (ce) {
    if (ce[2]) {
      out.born_ce = ce[1] && !/^0+$/.test(ce[1]) ? Number(ce[1]) : null;
      out.died_ce = Number(ce[2]);
    } else if (ce[1]) out.died_ce = Number(ce[1]);
  }
  return out;
}

/**
 * @param {string} html  full /author/<id> page
 * @returns {{ found: boolean, reason?: string, name?, headline?, full_name?, born_hijri?, died_hijri?, born_ce?, died_ce?, biography?: string[], works?: string[], references?: string[], source?: string }}
 */
export function parseAuthorBiography(html) {
  const lines = htmlToLines(html);
  const start = lines.findIndex((l) => BIO_HEADING_RE.test(l));
  if (start < 0) return { found: false, reason: "no_biography_section" };

  const body = [];
  let source = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (FOOTER_RE.test(l)) break;
    const src = SOURCE_RE.exec(l);
    if (src) {
      source = src[1].trim();
      break;
    }
    body.push(l);
  }
  if (!body.length) return { found: false, reason: "empty_biography_section" };

  const headline = body[0];
  const fullName = body.length > 1 && !/^[•(_]/.test(body[1]) ? body[1] : null;
  const biography = [];
  const works = [];
  const references = [];
  let mode = "bio";
  for (const l of body.slice(fullName ? 2 : 1)) {
    if (RULE_RE.test(l)) {
      mode = "refs";
      continue;
    }
    if (/^صاحب\s*[:：]?$/.test(l) || /^(?:له|من (?:مؤلفاته|تصانيفه|كتبه))\s*[:：]?$/.test(l)) {
      mode = "works";
      continue;
    }
    const text = l.replace(/^[•●▪\-–]\s*/, "").trim();
    if (!text) continue;
    if (mode === "refs") references.push(text);
    else if (mode === "works") works.push(text);
    else biography.push(text);
  }
  return {
    found: true,
    headline,
    full_name: fullName,
    ...datesFromHeadline(headline),
    biography,
    works,
    references,
    source,
  };
}
