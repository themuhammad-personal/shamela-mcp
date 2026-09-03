/**
 * Conservative citation-marker detection for shamela.ws page text.
 *
 * Split out of `scripts/build-hadith-index.mjs` so it is unit-testable offline
 * and reusable (Roadmap Phase 2 / guardrail: "never fabricate").
 *
 * The rule this module lives by: **return nothing rather than something wrong.**
 * A missing hadith number is a gap the caller can see; a wrong one is a
 * misquotation of the Prophet ﷺ that a scholar will catch and never trust again.
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
  return String(s).replace(ARABIC_DIGITS, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * Hadith-number markers, strongest first.
 *   1. explicit "رقم الحديث / الحديث رقم / برقم" + number — reliable
 *   2. a number at the very start of a line followed by a dash/period — the
 *      common printed-hadith layout, but weaker, so it must lead the line
 */
const NUMBER_PATTERNS = [
  /(?:رقم\s*الحديث|الحديث\s*رقم|برقم)\s*[:：]?\s*\(?([٠-٩0-9۰-۹]{1,5})\)?/gi,
  /^\s*([٠-٩0-9۰-۹]{1,5})\s*[-–.]\s+/gm,
];

/**
 * Every hadith number explicitly marked on a page.
 * @returns {string[]} latin digits, de-duplicated, in first-seen order; [] if unmarked.
 */
export function detectHadithNumbers(content) {
  const text = String(content ?? "");
  const found = new Set();
  for (const re of NUMBER_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const n = toLatinDigits(m[1]).trim();
      // Leading zeros are a transcription artefact, not a hadith number.
      if (n && !/^0+$/.test(n) && !n.startsWith("0")) found.add(n);
    }
  }
  return [...found];
}

/**
 * Surah number → name, for reference resolution.
 *
 * Single-letter surah names (ص #38, ق #50 is two letters and safe) are omitted
 * on purpose: matching a bare "ص" inside prose would manufacture references.
 */
export const SURAH_NAMES = [
  [1, "الفاتحة"], [2, "البقرة"], [3, "آل عمران"], [4, "النساء"], [5, "المائدة"],
  [6, "الأنعام"], [7, "الأعراف"], [8, "الأنفال"], [9, "التوبة"], [10, "يونس"],
  [11, "هود"], [12, "يوسف"], [13, "الرعد"], [14, "إبراهيم"], [15, "الحجر"],
  [16, "النحل"], [17, "الإسراء"], [18, "الكهف"], [19, "مريم"], [20, "طه"],
  [21, "الأنبياء"], [22, "الحج"], [23, "المؤمنون"], [24, "النور"], [25, "الفرقان"],
  [26, "الشعراء"], [27, "النمل"], [28, "القصص"], [29, "العنكبوت"], [30, "الروم"],
  [31, "لقمان"], [32, "السجدة"], [33, "الأحزاب"], [34, "سبأ"], [35, "فاطر"],
  [36, "يس"], [37, "الصافات"],
  // 38 = سورة ص — deliberately absent: a one-letter name is not safely matchable.
  [39, "الزمر"], [40, "غافر"], [41, "فصلت"], [42, "الشورى"], [43, "الزخرف"],
  [44, "الدخان"], [45, "الجاثية"], [46, "الأحقاف"], [47, "محمد"], [48, "الفتح"],
  [49, "الحجرات"],
  // 50 = سورة ق — deliberately absent (one letter).
  [51, "الذاريات"], [52, "الطور"], [53, "النجم"], [54, "القمر"], [55, "الرحمن"],
  [56, "الواقعة"], [57, "الحديد"], [58, "المجادلة"], [59, "الحشر"], [60, "الممتحنة"],
  [61, "الصف"], [62, "الجمعة"], [63, "المنافقون"], [64, "التغابن"], [65, "الطلاق"],
  [66, "التحريم"], [67, "الملك"], [68, "القلم"], [69, "الحاقة"], [70, "المعارج"],
  [71, "نوح"], [72, "الجن"], [73, "المزمل"], [74, "المدثر"], [75, "القيامة"],
  [76, "الإنسان"], [77, "المرسلات"], [78, "النبأ"], [79, "النازعات"], [80, "عبس"],
  [81, "التكوير"], [82, "الانفطار"], [83, "المطففين"], [84, "الانشقاق"], [85, "البروج"],
  [86, "الطارق"], [87, "الأعلى"], [88, "الغاشية"], [89, "الفجر"], [90, "البلد"],
  [91, "الشمس"], [92, "الليل"], [93, "الضحى"], [94, "الشرح"], [95, "التين"],
  [96, "العلق"], [97, "القدر"], [98, "البينة"], [99, "الزلزلة"], [100, "العاديات"],
  [101, "القارعة"], [102, "التكاثر"], [103, "العصر"], [104, "الهمزة"], [105, "الفيل"],
  [106, "قريش"], [107, "الماعون"], [108, "الكوثر"], [109, "الكافرون"], [110, "النصر"],
  [111, "المسد"], [112, "الإخلاص"], [113, "الفلق"], [114, "الناس"],
];

export const SURAH_BY_NAME = new Map(SURAH_NAMES.map(([n, name]) => [normalizeArabic(name), n]));

/**
 * Ayah count per surah (standard Kufan/Hafs counting), index 1–114.
 *
 * A global bound alone is not enough: "سورة الناس: 7" is inside 1–286 but there
 * is no such ayah. Validating against the real count is what stops the detector
 * from manufacturing a citation that looks plausible.
 */
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

/** Longest ayah count in the Qur'an (al-Baqarah) — used as a sanity bound. */
export const MAX_AYAH = 286;

const AYAH_RE =
  /سورة\s+([^\d٠-٩۰-۹\n]{1,40}?)\s*[:：(\[]?\s*([٠-٩0-9۰-۹]{1,3})(?:\s*[-–—]\s*([٠-٩0-9۰-۹]{1,3}))?/g;

/** Reduce a captured "سورة X" fragment to bare name words for table lookup. */
function nameWords(raw) {
  return normalizeArabic(String(raw).replace(/[:：()[\]،.;،\-]/g, " ").replace(/(ال)?آية/g, " "))
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Ayah references a tafsir page *explicitly* states, e.g. "سورة البقرة: 255".
 *
 * Multi-word names (آل عمران) are matched longest-first; if the name is not in
 * the table, or the number is out of range, the match is dropped.
 *
 * @returns {string[]} `"surah:ayah"` keys, de-duplicated.
 */
export function detectAyahs(content) {
  const text = String(content ?? "");
  const found = new Set();
  AYAH_RE.lastIndex = 0;
  let m;
  while ((m = AYAH_RE.exec(text))) {
    const words = nameWords(m[1]);
    let surah = 0;
    // Try the 3-word, then 2-word, then 1-word prefix (آل عمران before آل).
    for (let len = Math.min(words.length, 3); len >= 1 && !surah; len -= 1) {
      surah = SURAH_BY_NAME.get(words.slice(0, len).join(" ")) ?? 0;
    }
    if (!surah) continue;
    const from = Number(toLatinDigits(m[2]));
    const to = m[3] ? Number(toLatinDigits(m[3])) : from;
    const count = AYAH_COUNTS[surah] ?? 0;
    // Validate against the surah's real length, not just the global max — and
    // drop the whole match if any part of a range is invalid (never clamp).
    if (!from || from > count || !to || to < from || to > count) continue;
    // Cap range expansion: a whole-surah span is a section heading, not 286 refs.
    for (let ayah = from; ayah <= to && ayah - from < 50; ayah += 1) found.add(`${surah}:${ayah}`);
  }
  return [...found];
}
