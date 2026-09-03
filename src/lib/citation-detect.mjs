/**
 * Citation-marker detection for shamela.ws page text.
 *
 * Rule this module lives by: **return nothing rather than something wrong.**
 * A missing hadith number is a gap the caller can see; a wrong one is a
 * misattribution a scholar will catch and never trust again.
 *
 * Everything here is pure and offline-testable. Inputs are *paragraphs* (see
 * `lib/page.mjs`), not a flattened blob — hadith numbers are only meaningful
 * at the START of a paragraph, and footnotes (`p.hamesh`) are excluded by the
 * page parser so takhrij like «صحيح البخاري برقم (١٧٤٧)» is never mistaken
 * for a number on this page.
 *
 * Verified layouts (live shamela.ws, 2026-09-03):
 *   Bukhari 1681 / Tirmidhi 1435 / Muwatta 1699 …  «١ - حَدَّثَنَا …»
 *   Muslim 1727                                     «١ - (٨) أَبُو خَيْثَمَةَ …»
 *        → running number inside the kitab, then Abd al-Baqi's number in
 *          parentheses; the citable number is the one in parentheses.
 *   Ibn Kathir 8473 (tafsir)   «﴿… (١٣٠) …﴾», «[الرحمن: ٥٤]», «[الأعلى: ٦، ٧]»
 */

import { normalizeArabic } from "./arabic.mjs";

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const DIGIT_MAP = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function toLatinDigits(s) {
  return String(s ?? "").replace(ARABIC_DIGITS, (d) => DIGIT_MAP[d] ?? d);
}

const DIGITS = "[٠-٩0-9۰-۹]";
const DASH = "[-–—ـ]";

/**
 * A hadith marker at the start of a paragraph:
 *   «١٢ - …»            → number 12
 *   «٣ - (١٢) …»        → number 12 (Muslim: kitab-local 3, Abd al-Baqi 12)
 *   «[١٢] …» / «(١٢) - …» are NOT accepted — «(١)» also opens footnotes and
 *   apparatus lines, and «[…]» is used for editorial insertions.
 */
const MARKER_RE = new RegExp(`^\\s*(${DIGITS}{1,5})\\s*${DASH}\\s*(?:\\((${DIGITS}{1,5})\\)\\s*)?(?=\\S)`);

/** Printed-page markers «⦗٣٧⦘» and stray whitespace never count as content. */
const PAGE_MARK_RE = /^[\s⦗⦘٠-٩0-9]*$/;

function validNumber(raw) {
  const n = toLatinDigits(raw).trim();
  if (!n || /^0/.test(n)) return null; // leading zero = transcription artefact
  return n;
}

/**
 * Detect hadith markers per paragraph.
 *
 * @param {string[]|string} paragraphs  main-text paragraphs (footnotes already removed)
 * @returns {{ number: string, sub_number: string|null, paragraph: number }[]}
 *   `number` = citable hadith number; `sub_number` = kitab-local running
 *   number when the edition prints both (Muslim); `paragraph` = index.
 */
export function detectHadithMarkers(paragraphs) {
  const list = Array.isArray(paragraphs) ? paragraphs : String(paragraphs ?? "").split(/\r?\n+/);
  const out = [];
  list.forEach((p, i) => {
    const text = String(p ?? "");
    if (PAGE_MARK_RE.test(text)) return;
    const m = MARKER_RE.exec(text);
    if (!m) return;
    const first = validNumber(m[1]);
    const paren = m[2] ? validNumber(m[2]) : null;
    if (!first && !paren) return;
    if (paren) out.push({ number: paren, sub_number: first, paragraph: i });
    else out.push({ number: first, sub_number: null, paragraph: i });
  });
  return out;
}

/**
 * Every hadith number marked on a page, de-duplicated, in order.
 * Accepts paragraphs (preferred) or a newline-separated string.
 * @returns {string[]}
 */
export function detectHadithNumbers(paragraphs) {
  const seen = new Set();
  const out = [];
  for (const m of detectHadithMarkers(paragraphs)) {
    if (seen.has(m.number)) continue;
    seen.add(m.number);
    out.push(m.number);
  }
  return out;
}

/**
 * Slice the paragraphs that belong to one hadith on a page: from its marker
 * up to (not including) the next marker. Returns null when the number is not
 * marked on this page — never a guess.
 */
export function extractHadith(paragraphs, hadithNumber) {
  const list = Array.isArray(paragraphs) ? paragraphs : String(paragraphs ?? "").split(/\r?\n+/);
  const markers = detectHadithMarkers(list);
  const num = String(hadithNumber);
  // Muslim prints several routes of the same number on consecutive paragraphs
  // («١ - (٨) …», «٢ - (٨) …»); take from the first to before the next *other* number.
  const startIdx = markers.findIndex((m) => m.number === num);
  if (startIdx < 0) return null;
  const start = markers[startIdx].paragraph;
  const next = markers.slice(startIdx + 1).find((m) => m.number !== num);
  const end = next ? next.paragraph : list.length;
  const routes = markers.filter((m) => m.number === num).map((m) => m.sub_number).filter(Boolean);
  return {
    number: num,
    paragraphs: list.slice(start, end),
    text: list.slice(start, end).join("\n"),
    starts_at_paragraph: start,
    // A hadith can run past the page break; the caller decides whether to
    // fetch the next page (its first paragraphs carry no marker).
    ends_at_page_end: end === list.length,
    routes_on_page: routes.length ? routes : undefined,
  };
}

// ---------------------------------------------------------------------------
// Qur'an references
// ---------------------------------------------------------------------------

/**
 * Surah number → canonical name plus accepted aliases (all 114).
 * Aliases are classical/alternate names that appear in tafsir headings.
 */
export const SURAH_NAMES = [
  [1, "الفاتحة", "فاتحة الكتاب", "أم الكتاب", "أم القرآن", "الحمد"],
  [2, "البقرة"], [3, "آل عمران"], [4, "النساء"], [5, "المائدة"],
  [6, "الأنعام"], [7, "الأعراف"], [8, "الأنفال"], [9, "التوبة", "براءة"], [10, "يونس"],
  [11, "هود"], [12, "يوسف"], [13, "الرعد"], [14, "إبراهيم"], [15, "الحجر"],
  [16, "النحل"], [17, "الإسراء", "بني إسرائيل", "سبحان"], [18, "الكهف"], [19, "مريم"], [20, "طه"],
  [21, "الأنبياء"], [22, "الحج"], [23, "المؤمنون"], [24, "النور"], [25, "الفرقان"],
  [26, "الشعراء"], [27, "النمل"], [28, "القصص"], [29, "العنكبوت"], [30, "الروم"],
  [31, "لقمان"], [32, "السجدة"], [33, "الأحزاب"], [34, "سبأ"], [35, "فاطر", "الملائكة"],
  [36, "يس"], [37, "الصافات"], [38, "ص"], [39, "الزمر"], [40, "غافر", "المؤمن"],
  [41, "فصلت", "حم السجدة"], [42, "الشورى"], [43, "الزخرف"], [44, "الدخان"], [45, "الجاثية"],
  [46, "الأحقاف"], [47, "محمد", "القتال"], [48, "الفتح"], [49, "الحجرات"], [50, "ق"],
  [51, "الذاريات"], [52, "الطور"], [53, "النجم"], [54, "القمر"], [55, "الرحمن"],
  [56, "الواقعة"], [57, "الحديد"], [58, "المجادلة"], [59, "الحشر"], [60, "الممتحنة"],
  [61, "الصف"], [62, "الجمعة"], [63, "المنافقون"], [64, "التغابن"], [65, "الطلاق"],
  [66, "التحريم"], [67, "الملك", "تبارك"], [68, "القلم", "ن"], [69, "الحاقة"], [70, "المعارج"],
  [71, "نوح"], [72, "الجن"], [73, "المزمل"], [74, "المدثر"], [75, "القيامة"],
  [76, "الإنسان", "الدهر"], [77, "المرسلات"], [78, "النبأ", "عم"], [79, "النازعات"], [80, "عبس"],
  [81, "التكوير"], [82, "الانفطار"], [83, "المطففين", "التطفيف"], [84, "الانشقاق"], [85, "البروج"],
  [86, "الطارق"], [87, "الأعلى"], [88, "الغاشية"], [89, "الفجر"], [90, "البلد"],
  [91, "الشمس"], [92, "الليل"], [93, "الضحى"], [94, "الشرح", "الانشراح", "ألم نشرح"], [95, "التين"],
  [96, "العلق", "اقرأ"], [97, "القدر"], [98, "البينة", "لم يكن"], [99, "الزلزلة", "الزلزال"], [100, "العاديات"],
  [101, "القارعة"], [102, "التكاثر"], [103, "العصر"], [104, "الهمزة"], [105, "الفيل"],
  [106, "قريش", "لإيلاف"], [107, "الماعون"], [108, "الكوثر"], [109, "الكافرون"], [110, "النصر"],
  [111, "المسد", "اللهب", "تبت"], [112, "الإخلاص", "التوحيد"], [113, "الفلق"], [114, "الناس"],
];

/** normalized name/alias → surah number */
export const SURAH_BY_NAME = new Map();
for (const [n, ...names] of SURAH_NAMES) for (const name of names) SURAH_BY_NAME.set(normalizeArabic(name), n);

/** Names that are a single letter: only matched in unambiguous positions. */
const SINGLE_LETTER = new Set(["ص", "ق", "ن"]);

/** Ayah count per surah (Kufan/Hafs counting), index 1–114. */
export const AYAH_COUNTS = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
];
export const MAX_AYAH = 286;

/** Resolve a surah name fragment (up to 3 words) → number, or 0. */
function lookupSurah(raw, { allowSingleLetter = false } = {}) {
  const words = normalizeArabic(String(raw).replace(/[:：()[\]،.;\-]/g, " ").replace(/(ال)?آي[ةه]/g, " "))
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i) => !(i === 0 && w === "سوره"));
  for (let len = Math.min(words.length, 3); len >= 1; len -= 1) {
    const key = words.slice(0, len).join(" ");
    const n = SURAH_BY_NAME.get(key);
    if (n && (allowSingleLetter || !SINGLE_LETTER.has(key))) return n;
  }
  return 0;
}

/**
 * Surah number from a chapter heading such as «تفسير سورة آل عمران»,
 * «سورة النور», «[سورة ص]», «تفسير سورة إبراهيم ﵇». Single-letter names are
 * allowed here because a heading is unambiguous. Returns 0 if not a surah heading.
 */
export function surahFromHeading(title) {
  const t = normalizeArabic(String(title ?? "").replace(/[[\]()﵇﵍]/g, " "));
  const m = /(?:^|\s)سوره\s+(.+)$/.exec(t);
  if (!m) return 0;
  return lookupSurah(m[1], { allowSingleLetter: true });
}

const NUM = `${DIGITS}{1,3}`;
/** «سورة البقرة: ٢٥٥», «سورة المائدة الآية ٣», «سورة البقرة ١٠-١٢» */
const PROSE_RE = new RegExp(`سورة\\s+([^\\d٠-٩۰-۹\\n\\[\\]]{1,40}?)\\s*[:：(]?\\s*(${NUM})(?:\\s*[-–—]\\s*(${NUM}))?`, "g");
/** «[البقرة: ٢٥٥]», «[الأعلى: ٦، ٧]», «[آل عمران: ١٣٠ - ١٣٢]» */
const BRACKET_RE = new RegExp(`\\[\\s*([^\\d٠-٩۰-۹\\[\\]:：]{1,30}?)\\s*[:：]\\s*(${NUM}(?:\\s*(?:[-–—]|،|,)\\s*${NUM})*)\\s*\\]`, "g");

function addRange(found, surah, from, to) {
  const count = AYAH_COUNTS[surah] ?? 0;
  if (!from || !to || to < from || to > count) return; // drop, never clamp
  for (let a = from; a <= to && a - from < 50; a += 1) found.add(`${surah}:${a}`);
}

/**
 * Ayah references a page *explicitly* states.
 * @returns {string[]} `"surah:ayah"` keys, de-duplicated, first-seen order.
 */
export function detectAyahs(content) {
  const text = Array.isArray(content) ? content.join("\n") : String(content ?? "");
  const found = new Set();

  PROSE_RE.lastIndex = 0;
  let m;
  while ((m = PROSE_RE.exec(text))) {
    const surah = lookupSurah(m[1]);
    if (!surah) continue;
    const from = Number(toLatinDigits(m[2]));
    const to = m[3] ? Number(toLatinDigits(m[3])) : from;
    addRange(found, surah, from, to);
  }

  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text))) {
    const surah = lookupSurah(m[1], { allowSingleLetter: true });
    if (!surah) continue;
    const parts = toLatinDigits(m[2]).split(/\s*(?:،|,)\s*/);
    for (const part of parts) {
      const [a, b] = part.split(/\s*[-–—]\s*/).map((x) => Number(x));
      addRange(found, surah, a, b ?? a);
    }
  }
  return [...found];
}

/**
 * Ayah numbers printed inside Qur'anic brackets «﴿ … (١٣٠) … ﴾» on a page whose
 * surah is already known (from the chapter path). This is how tafsir editions
 * mark which ayah is being explained. Returns ascending unique ayah numbers.
 */
export function detectQuranBracketAyahs(content, surah) {
  const text = Array.isArray(content) ? content.join("\n") : String(content ?? "");
  const count = AYAH_COUNTS[surah] ?? 0;
  if (!count) return [];
  const out = new Set();
  const block = /﴿([^﴾]*)﴾/g;
  let b;
  while ((b = block.exec(text))) {
    const inner = new RegExp(`\\((${NUM})\\)`, "g");
    let n;
    while ((n = inner.exec(b[1]))) {
      const v = Number(toLatinDigits(n[1]));
      if (v >= 1 && v <= count) out.add(v);
    }
  }
  return [...out].sort((a, c) => a - c);
}
