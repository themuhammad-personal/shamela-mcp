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
// Editorial gradings (al-Albani)
// ---------------------------------------------------------------------------

/**
 * Albani's verdict as printed by the shamela editions of the Sunan:
 *   Tirmidhi 1435   footnote «[حكم الألباني] : صحيح»
 *   Abu Dawud 1726  footnote «[حكم الألباني] : حسن صحيح»
 *   Ibn Majah 1198  footnote «[حكم الألباني]» + line break + «صحيح»
 *   (some prints)   footnote «قال الألباني: ضعيف» / «قال الشيخ الألباني: …»
 *
 * ONLY these explicit attributions count. Tirmidhi's own «هذا حديث حسن صحيح»,
 * a muhaqqiq's «إسناده صحيح», or prose mentioning الألباني are never turned
 * into a grading — returns [] rather than a guess.
 *
 * Verdict text: everything after the label up to the end of that line/entry
 * («صحيح دون قوله …» is kept whole). `verdict_class` folds it to one of
 * sahih | hasan_sahih | hasan | daif | mawdu | other for filtering.
 */
const ALBANI_LABEL_RE = /\[\s*حكم\s+الألباني\s*\][\t ]*(?::|：)?[\t ]*/gu;
const ALBANI_SAID_RE = /(?:^|\n|[.،;؛]\s*)قال\s+(?:الشيخ\s+)?(?:محمد\s+ناصر\s+الدين\s+)?الألباني\s*(?:رحمه الله\s*)?[:：]\s*([^\n]+)/u;

function classifyVerdict(v) {
  const t = normalizeArabic(v).replace(/^(?:حديث|هذا حديث)\s+/, "");
  if (!t) return "other";
  if (/^موضوع/.test(t)) return "mawdu";
  if (/^حسن صحيح/.test(t)) return "hasan_sahih";
  if (/^(ضعيف|منكر|شاذ|باطل|لا اصل له|ليس بصحيح|مضطرب|معلول|معل\b)/.test(t)) return "daif";
  if (/^حسن/.test(t)) return "hasan";
  if (/^صحيح/.test(t)) return "sahih";
  const isnad = /^(اسناده|سنده)\s+(صحيح|حسن|ضعيف)/.exec(t);
  if (isnad) return isnad[2] === "صحيح" ? "sahih" : isnad[2] === "حسن" ? "hasan" : "daif";
  return "other";
}

/**
 * All explicit Albani gradings printed on a page.
 * @param {string[]} footnotes  `parseBookPage().footnotes` (p.hamesh)
 * @param {string[]} [paragraphs] main paragraphs — only the bracketed label
 *   «[حكم الألباني]» is honoured there (a few prints put it inline).
 * @returns {{grader:string, verdict:string, verdict_class:string, raw:string, where:"footnote"|"text", index:number}[]}
 */
export function extractGradings(footnotes, paragraphs = []) {
  const out = [];
  const scan = (text, where, index, allowSaid) => {
    const src = String(text ?? "");
    if (!src) return;

    // A footnote block can contain several entries. Find every label first and
    // bound each verdict by the same line (or the next label), so one verdict
    // cannot swallow the next entry in the block.
    const labels = [];
    ALBANI_LABEL_RE.lastIndex = 0;
    let label;
    while ((label = ALBANI_LABEL_RE.exec(src))) labels.push(label);
    if (labels.length) {
      labels.forEach((m, labelIndex) => {
        const nextLabel = labels[labelIndex + 1]?.index ?? src.length;
        const lineEnd = src.indexOf("\n", m.index);
        const sameLineEnd = Math.min(nextLabel, lineEnd < 0 ? src.length : lineEnd);
        let verdict = src.slice(m.index + m[0].length, sameLineEnd).trim();
        if (!verdict) {
          // «[حكم الألباني]» alone on its line → the verdict is the next
          // non-empty line (Ibn Majah 1198), but never a later label's text.
          verdict = src
            .slice(m.index + m[0].length, nextLabel)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) ?? "";
        }
        verdict = verdict.replace(/^[\s:：\-–]+/, "").replace(new RegExp(`\\s*\\(${DIGITS}+\\)\\s*$`), "").trim();
        if (verdict) out.push({ grader: "الألباني", verdict, verdict_class: classifyVerdict(verdict), raw: src.trim(), where, index });
      });
      return;
    }
    if (!allowSaid) return;
    const q = ALBANI_SAID_RE.exec(src);
    if (q) {
      const verdict = q[1].replace(/[.،;؛]\s*$/, "").trim();
      if (verdict && classifyVerdict(verdict) !== "other") out.push({ grader: "الألباني", verdict, verdict_class: classifyVerdict(verdict), raw: src.trim(), where, index });
    }
  };
  (Array.isArray(footnotes) ? footnotes : []).forEach((f, i) => scan(f, "footnote", i, true));
  (Array.isArray(paragraphs) ? paragraphs : []).forEach((p, i) => scan(p, "text", i, false));
  return out;
}

/**
 * The grading that belongs to ONE hadith on a page, or null.
 *
 * Pages usually carry one hadith and one «[حكم الألباني]». When a page holds
 * several hadiths the editions print one verdict line per hadith in order; that
 * order mapping is exposed as `attribution: "by_order_on_page"` and only used
 * when the counts match exactly. Otherwise `grading` is null and the caller
 * gets the raw list in `gradings_on_page` — never a guessed assignment.
 *
 * @param {object} args
 * @param {string[]} args.footnotes
 * @param {string[]} [args.paragraphs]
 * @param {string[]} [args.numbersOnPage]  hadith numbers printed on the page, in order
 * @param {string}   [args.hadithNumber]
 */
export function gradingForHadith({ footnotes, paragraphs = [], numbersOnPage = [], hadithNumber } = {}) {
  const all = extractGradings(footnotes, paragraphs);
  if (!all.length) return { grading: null, gradings_on_page: [] };
  const pick = (g, attribution) => ({
    grading: { grader: g.grader, verdict: g.verdict, verdict_class: g.verdict_class, raw: g.raw, attribution },
    gradings_on_page: all.map((x) => ({ verdict: x.verdict, verdict_class: x.verdict_class, where: x.where })),
  });
  const distinct = [...new Set(numbersOnPage.map(String))];
  if (all.length === 1 && distinct.length <= 1) return pick(all[0], "only_grading_on_page");
  if (hadithNumber != null && distinct.length === all.length) {
    const pos = distinct.indexOf(String(hadithNumber));
    if (pos >= 0) return pick(all[pos], "by_order_on_page");
  }
  return {
    grading: null,
    gradings_on_page: all.map((x) => ({ verdict: x.verdict, verdict_class: x.verdict_class, where: x.where })),
    grading_note: `পৃষ্ঠায় ${all.length}টি আলবানী-হুকুম ও ${distinct.length}টি হাদিস — কোনটি এই হাদিসের তা নিশ্চিত নয়; gradings_on_page দেখুন।`,
  };
}

/**
 * Grading for a hadith that may run across several pages. Each page is judged
 * on its own (its footnotes vs. the hadith numbers printed on it); on a
 * continuation page the running hadith counts as the first number. The first
 * page that yields an unambiguous grading wins.
 *
 * @param {{page:string, footnotes:string[], paragraphs?:string[], numbers:string[]}[]} pages
 * @param {string} hadithNumber
 */
export function gradingAcrossPages(pages, hadithNumber) {
  const num = String(hadithNumber);
  const all = [];
  let note;
  for (let i = 0; i < (pages ?? []).length; i += 1) {
    const pg = pages[i];
    const numbers = [...new Set(pg.numbers ?? [])];
    if (i > 0 && !numbers.includes(num)) numbers.unshift(num);
    const r = gradingForHadith({ footnotes: pg.footnotes, paragraphs: pg.paragraphs, numbersOnPage: numbers, hadithNumber: num });
    all.push(...r.gradings_on_page.map((g) => ({ ...g, page: pg.page })));
    if (r.grading) return { grading: { ...r.grading, page: pg.page }, gradings_on_page: all };
    if (r.grading_note) note = r.grading_note;
  }
  return { grading: null, gradings_on_page: all, ...(note ? { grading_note: note } : {}) };
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
  [21, "الأنبياء"], [22, "الحج"], [23, "المؤمنون", "قد أفلح المؤمنون", "المؤمنين"], [24, "النور"], [25, "الفرقان"],
  [26, "الشعراء"], [27, "النمل"], [28, "القصص"], [29, "العنكبوت"], [30, "الروم"],
  [31, "لقمان"], [32, "السجدة"], [33, "الأحزاب"], [34, "سبأ"], [35, "فاطر", "الملائكة"],
  [36, "يس"], [37, "الصافات"], [38, "ص"], [39, "الزمر"], [40, "غافر", "المؤمن", "حم المؤمن"],
  [41, "فصلت", "حم السجدة"], [42, "الشورى", "حم عسق", "عسق"], [43, "الزخرف"], [44, "الدخان"], [45, "الجاثية"],
  [46, "الأحقاف"], [47, "محمد", "القتال"], [48, "الفتح"], [49, "الحجرات"], [50, "ق"],
  [51, "الذاريات"], [52, "الطور"], [53, "النجم"], [54, "القمر", "اقتربت الساعة", "اقتربت"], [55, "الرحمن"],
  [56, "الواقعة"], [57, "الحديد"], [58, "المجادلة"], [59, "الحشر"], [60, "الممتحنة"],
  [61, "الصف"], [62, "الجمعة"], [63, "المنافقون", "المنافقين"], [64, "التغابن"], [65, "الطلاق"],
  [66, "التحريم"], [67, "الملك", "تبارك"], [68, "القلم", "ن"], [69, "الحاقة"], [70, "المعارج", "سأل سائل"],
  [71, "نوح"], [72, "الجن"], [73, "المزمل"], [74, "المدثر"], [75, "القيامة"],
  [76, "الإنسان", "الدهر", "هل أتى على الإنسان", "هل أتى"], [77, "المرسلات"], [78, "النبأ", "عم", "عم يتساءلون"], [79, "النازعات"], [80, "عبس"],
  [81, "التكوير", "إذا الشمس كورت", "كورت"], [82, "الانفطار", "إذا السماء انفطرت", "انفطرت"], [83, "المطففين", "التطفيف", "ويل للمطففين"], [84, "الانشقاق", "إذا السماء انشقت", "انشقت"], [85, "البروج"],
  [86, "الطارق", "السماء والطارق"], [87, "الأعلى", "سبح", "سبح اسم ربك الأعلى"], [88, "الغاشية"], [89, "الفجر"], [90, "البلد"],
  [91, "الشمس", "والشمس وضحاها", "الشمس وضحاها"], [92, "الليل", "والليل إذا يغشى"], [93, "الضحى", "والضحى"],
  [94, "الشرح", "الانشراح", "ألم نشرح"], [95, "التين", "والتين والزيتون", "التين والزيتون"],
  [96, "العلق", "اقرأ"], [97, "القدر"], [98, "البينة", "لم يكن"], [99, "الزلزلة", "الزلزال", "إذا زلزلت"], [100, "العاديات"],
  [101, "القارعة"], [102, "التكاثر", "ألهاكم", "ألهاكم التكاثر"], [103, "العصر"], [104, "الهمزة", "ويل لكل همزة", "ويل لكل همزة لمزة"], [105, "الفيل"],
  [106, "قريش", "لإيلاف", "لإيلاف قريش"], [107, "الماعون", "أرأيت"], [108, "الكوثر"], [109, "الكافرون", "قل يا أيها الكافرون"],
  [110, "النصر", "إذا جاء نصر الله", "إذا جاء نصر الله والفتح"],
  [111, "المسد", "اللهب", "تبت"], [112, "الإخلاص", "التوحيد"], [113, "الفلق"], [114, "الناس"],
];

/**
 * Headings that cover MORE than one surah. Ibn Kathir (8473) prints
 * «تفسير سورتي المعوذتين» once for al-Falaq + al-Nas (al-Nas still gets its
 * own TOC entry, but other editions may not).
 */
export const MULTI_SURAH_HEADINGS = [
  ["المعوذتين", [113, 114]],
  ["الفلق والناس", [113, 114]],
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

/** Resolve a surah name fragment (longest prefix first, up to 6 words) → number, or 0. */
function lookupSurah(raw, { allowSingleLetter = false } = {}) {
  const words = normalizeArabic(String(raw).replace(/[:：()[\]«»"“”،.;\-]/g, " ").replace(/(ال)?آي[ةه]/g, " "))
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i) => !(i === 0 && w === "سوره"))
    // Qurtubi prints «سورة و - الذاريات» (a stray conjunction token before the name).
    .filter((w, i) => !(i === 0 && w === "و"));
  const tryWords = (ws) => {
    for (let len = Math.min(ws.length, 6); len >= 1; len -= 1) {
      const key = ws.slice(0, len).join(" ");
      const n = SURAH_BY_NAME.get(key);
      if (n && (allowSingleLetter || !SINGLE_LETTER.has(key))) return n;
    }
    return 0;
  };
  const direct = tryWords(words);
  if (direct) return direct;
  // Oath-opening names are often written with the conjunction fused to the
  // word: «والنجم» «والطور» «والفجر» «والتين» «والعاديات» «والعصر» «والمرسلات».
  // Only the FIRST token is unfused, and only when it starts «وال…» so a real
  // name that starts with و (none does) or a plain «و…» word is never mangled.
  if (words.length && /^وال./.test(words[0])) return tryWords([words[0].slice(1), ...words.slice(1)]);
  return 0;
}

const MULTI_BY_NAME = new Map(MULTI_SURAH_HEADINGS.map(([name, list]) => [normalizeArabic(name), list]));

/**
 * All surah numbers a chapter heading refers to (usually one).
 *
 * Verified against the real TOC of Ibn Kathir 8473 (2026-09-03), which uses
 * every one of these shapes:
 *   «تفسير سورة آل عمران»      «سورة النور» (no تفسير)      «فاتحة الكتاب» (no سورة!)
 *   «تفسير سورة إبراهيم ﵇»    «تفسير سورة مريم [﵍]»       «تفسير سورة فاطر وهي مكية»
 *   «تفسير سورة "ن"»           «تفسير سورة سأل سائل»       «تفسير سورة قل يا أيها الكافرون»
 *   «تفسير السورة التي يذكر فيها الماعون»   «تفسير سورتي المعوذتين»
 * Single-letter names (ص، ق، ن) are allowed because a heading is unambiguous.
 * Returns [] when the title is not a surah heading — never a guess.
 */
export function surahsFromHeading(title) {
  let t = normalizeArabic(String(title ?? "").replace(/[[\]()«»"“”﵇﵍﵊﵌]/g, " "));
  if (!t) return [];
  // Tabari 7798: «القول في تأويل فاتحة الكتاب», «القول في تفسير السورة التي يذكر
  // فيها البقرة», «أول تفسير السورة التي يذكر فيها الرعد». Strip the formula;
  // what remains must still be a surah heading on its own («القول في تأويل
  // قوله: …» therefore stays unmatched).
  t = t.replace(/^(?:القول في|اول)\s+(?:تاويل|تفسير)\s+/, "").replace(/^(?:القول في|اول)\s+/, "");

  // «سورتي المعوذتين» / «سورتا الفلق والناس»
  const multi = /(?:^|\s)سورت[يا]\s+(.+)$/.exec(t);
  if (multi) {
    const key = normalizeArabic(multi[1]).split(/\s+/).slice(0, 3).join(" ");
    for (const [name, list] of MULTI_BY_NAME) if (key.startsWith(name)) return list;
    return [];
  }

  // «… السورة التي يذكر فيها الماعون»
  const described = /(?:^|\s)السوره\s+التي\s+(?:يذكر|ذكر|تذكر)\s+فيها\s+(.+)$/.exec(t);
  if (described) {
    const n = lookupSurah(described[1], { allowSingleLetter: true });
    return n ? [n] : [];
  }

  const m = /(?:^|\s)سوره\s+(.+)$/.exec(t);
  if (m) {
    const n = lookupSurah(m[1], { allowSingleLetter: true });
    return n ? [n] : [];
  }

  // No «سورة» keyword at all: accept only when the WHOLE heading (minus an
  // optional «تفسير») is itself a known name — «فاتحة الكتاب», «تفسير الفاتحة».
  const bare = t.replace(/^تفسير\s+/, "").trim();
  const words = bare.split(/\s+/);
  if (words.length <= 4) {
    const n = SURAH_BY_NAME.get(bare);
    if (n && !SINGLE_LETTER.has(bare)) return [n];
  }
  return [];
}

/**
 * Surah number from a chapter heading (first surah when a heading covers
 * several). Returns 0 if not a surah heading.
 */
export function surahFromHeading(title) {
  return surahsFromHeading(title)[0] ?? 0;
}

/**
 * Is this *paragraph* a surah heading printed inside the page text?
 * Ibn Kathir 8473 opens al-Shu'ara (page 3040) with the paragraph «سورة الشعراء»
 * and al-Ankabut with «تفسير سورة العنكبوت» (last paragraph of 3167) — neither
 * has a TOC entry, so the index builder must find them in the text. Only a
 * short paragraph that *starts* with the heading counts; prose mentioning a
 * surah («… في أول سورة "البقرة".») never does.
 */
export function surahHeadingInParagraph(paragraph) {
  const raw = String(paragraph ?? "").trim();
  if (!raw || raw.length > 60) return [];
  const t = normalizeArabic(raw.replace(/[[\]()«»"“”﵇﵍﵊﵌]/g, " "));
  if (!/^(?:تفسير\s+)?(?:سوره|سورت[يا]|السوره\s+التي|فاتحه الكتاب)/.test(t)) return [];
  if (/^(?:تفسير\s+)?سوره\s+\S+\s*[:：]/.test(t)) return []; // «سورة البقرة: ٢٥٥» is a reference, not a heading
  if (isAyahHeading(raw)) return []; // «[سورة البقرة (٢): آية ٨٠]» is Qurtubi's AYAH heading, not a surah start
  return surahsFromHeading(raw);
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
 * Qur'anic bracket segments «﴿ … ﴾» in ONE paragraph.
 *
 * A block can be split by the page break: the last paragraph of a page may
 * open «﴿» without closing, and the first paragraph of the next page may close
 * «﴾» without opening. Those halves are only accepted at the page edges
 * (`first` / `last`) so that inline footnote calls «(١)» in ordinary prose are
 * never mistaken for ayah numbers.
 */
function bracketSegments(text, { first = false, last = false } = {}) {
  const segs = [];
  const re = /﴿([^﴾]*)﴾/g;
  let m;
  while ((m = re.exec(text))) segs.push(m[1]);
  if (first) {
    const close = text.indexOf("﴾");
    const open = text.indexOf("﴿");
    if (close >= 0 && (open < 0 || close < open)) segs.push(text.slice(0, close));
  }
  if (last) {
    const open = text.lastIndexOf("﴿");
    if (open >= 0 && text.indexOf("﴾", open) < 0) segs.push(text.slice(open + 1));
  }
  return segs;
}

/**
 * Editorial ayah headings, as printed by al-Qurtubi 20855 (Dar al-Kutub
 * al-Misriyya) at the top of every ayah's discussion — the edition quotes the
 * ayah WITHOUT «﴿…﴾» brackets, so this heading is the only machine-readable
 * marker on the page:
 *   «[سورة البقرة (٢): آية ٨٠]»            → [80]
 *   «[سورة الناس (١١٤): الآيات ١ الى ٣]»    → [1, 2, 3]
 * The surah number in parentheses must match `surah`; when it is absent the
 * name is resolved instead. Only a short paragraph that IS the heading counts.
 */
const AYAH_HEADING_RE = new RegExp(
  `^\\s*\\[?\\s*سورة\\s+([^\\[\\]():：]{1,30}?)\\s*(?:\\((${DIGITS}{1,3})\\))?\\s*[:：]\\s*(?:الآيات|الايات|آية|اية)\\s+(${DIGITS}{1,3})(?:\\s*(?:إلى|الى|-|–)\\s*(${DIGITS}{1,3}))?\\s*\\]?\\s*$`,
);
/** Is this title/paragraph an editorial ayah heading («[سورة X (n): آية m]»)? Surah-agnostic. */
export function isAyahHeading(text) {
  const raw = String(text ?? "").trim();
  return raw.length > 0 && raw.length <= 80 && AYAH_HEADING_RE.test(raw);
}

export function ayahHeadingInParagraph(text, surah) {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 80) return [];
  const m = AYAH_HEADING_RE.exec(raw);
  if (!m) return [];
  const count = AYAH_COUNTS[surah] ?? 0;
  if (!count) return [];
  const numbered = m[2] ? Number(toLatinDigits(m[2])) : 0;
  const named = numbered ? 0 : lookupSurah(m[1], { allowSingleLetter: true });
  if ((numbered || named) !== surah) return [];
  const from = Number(toLatinDigits(m[3]));
  const to = m[4] ? Number(toLatinDigits(m[4])) : from;
  if (!from || to < from || to > count) return [];
  const out = [];
  for (let a = from; a <= to && a - from < 50; a += 1) out.push(a);
  return out;
}

/**
 * Ayah numbers marked in one paragraph for a known surah: «(n)» inside Qur'anic
 * brackets «﴿…﴾» (Ibn Kathir 8473, Tabari 7798) or an editorial ayah heading
 * «[سورة X (n): آية m]» (Qurtubi 20855).
 */
export function quranBracketAyahsInParagraph(text, surah, edges = {}) {
  const count = AYAH_COUNTS[surah] ?? 0;
  if (!count) return [];
  const out = new Set(ayahHeadingInParagraph(text, surah));
  for (const seg of bracketSegments(String(text ?? ""), edges)) {
    const inner = new RegExp(`\\((${NUM})\\)`, "g");
    let n;
    while ((n = inner.exec(seg))) {
      const v = Number(toLatinDigits(n[1]));
      if (v >= 1 && v <= count) out.add(v);
    }
  }
  return [...out].sort((a, c) => a - c);
}

/**
 * Ayah numbers printed inside Qur'anic brackets «﴿ … (١٣٠) … ﴾» on a page whose
 * surah is already known (from the chapter path / index). This is how tafsir
 * editions mark which ayah is being explained. Returns ascending unique ayah
 * numbers. Accepts the page's paragraphs (preferred — page-edge halves of a
 * split block are then recognised) or a flat string.
 */
export function detectQuranBracketAyahs(content, surah) {
  const list = Array.isArray(content) ? content.map((p) => String(p ?? "")) : [String(content ?? "")];
  const out = new Set();
  const firstIdx = list.findIndex((p) => !PAGE_MARK_RE.test(p) && p.trim() !== "﷽");
  const lastIdx = list.length - 1;
  list.forEach((p, i) => {
    for (const v of quranBracketAyahsInParagraph(p, surah, { first: i === firstIdx, last: i === lastIdx })) out.add(v);
  });
  return [...out].sort((a, c) => a - c);
}
