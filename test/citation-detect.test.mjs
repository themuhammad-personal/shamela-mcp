import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectHadithMarkers,
  detectHadithNumbers,
  extractHadith,
  detectAyahs,
  detectQuranBracketAyahs,
  surahFromHeading,
  SURAH_NAMES,
  AYAH_COUNTS,
} from "../src/lib/citation-detect.mjs";

// --- hadith numbers (verified layouts) -----------------------------------

test("Bukhari 1681 layout: «١ - حَدَّثَنَا …» at paragraph start", () => {
  const paras = ["١ - حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللَّهِ بْنُ الزُّبَيْرِ، قَالَ: حَدَّثَنَا سُفْيَانُ"];
  assert.deepEqual(detectHadithNumbers(paras), ["1"]);
});

test("Muslim 1727 layout: «١ - (٨) …» → citable number is the one in parentheses", () => {
  const paras = [
    "١ - (٨) أَبُو خَيْثَمَةَ زُهَيْرُ بْنُ حَرْبٍ. حَدَّثَنَا وَكِيعٌ …",
    "كَانَ أَوَّلَ مَنْ قَالَ فِي الْقَدَرِ بِالْبَصْرَةِ مَعْبَدٌ الْجُهَنِيُّ …",
    "⦗٣٧⦘",
    "٤ - (٨) وحدثني حجاج بن الشاعر …",
    "٥ - (٩) حَدَّثَنَا أَبُو بَكْرِ بْنُ أَبِي شَيْبَةَ …",
  ];
  const m = detectHadithMarkers(paras);
  assert.deepEqual(m, [
    { number: "8", sub_number: "1", paragraph: 0 },
    { number: "8", sub_number: "4", paragraph: 3 },
    { number: "9", sub_number: "5", paragraph: 4 },
  ]);
  assert.deepEqual(detectHadithNumbers(paras), ["8", "9"]);
});

test("several hadiths on one page, de-duplicated, in order (old bug: only the first was found)", () => {
  const paras = ["٢ - حَدَّثَنَا عَبْدُ اللَّهِ", "٣ - حَدَّثَنَا يَحْيَى", "٣ - حَدَّثَنَا يَحْيَى (repeat)", "٤ - قَالَ ابْنُ شِهَابٍ"];
  assert.deepEqual(detectHadithNumbers(paras), ["2", "3", "4"]);
});

test("numbers inside prose / footnote-style takhrij are NOT hadith markers", () => {
  const paras = [
    "وقد ثبت في الصحيحين، عن ابن مسعود: أنه رمى الجمرة … أخرجاه (٦).",
    "(٦) صحيح البخاري برقم (١٧٤٧) وصحيح مسلم برقم (١٢٩٦).",
    "(١) زيادة من جـ، ط، ب، أ، و.",
    "[١٢] إدراج من المحقق",
    "رواه الطبراني في الأوسط برقم (٣٤٥٠)",
  ];
  assert.deepEqual(detectHadithNumbers(paras), []);
});

test("no marker → empty, never a guess; leading zeros rejected; page marks ignored", () => {
  assert.deepEqual(detectHadithNumbers(["حدثنا الحميدي قال حدثنا سفيان"]), []);
  assert.deepEqual(detectHadithNumbers([]), []);
  assert.deepEqual(detectHadithNumbers(null), []);
  assert.deepEqual(detectHadithNumbers(["٠٠٧ - حدثنا"]), []);
  assert.deepEqual(detectHadithNumbers(["⦗٦⦘", "١٢٣"]), []);
});

test("latin digits and en-dash accepted", () => {
  assert.deepEqual(detectHadithNumbers(["12 – حدثنا"]), ["12"]);
});

test("extractHadith slices the right paragraphs and reports Muslim routes", () => {
  const paras = [
    "٧ - حَدَّثَنَا أَبُو الْيَمَانِ …",
    "تابع الحديث ٧ …",
    "٨ - حَدَّثَنَا عُبَيْدُ اللهِ …",
    "٩ - حَدَّثَنَا …",
  ];
  const h = extractHadith(paras, 8);
  assert.equal(h.number, "8");
  assert.deepEqual(h.paragraphs, ["٨ - حَدَّثَنَا عُبَيْدُ اللهِ …"]);
  assert.equal(h.ends_at_page_end, false);
  const last = extractHadith(paras, 9);
  assert.equal(last.ends_at_page_end, true);
  assert.equal(extractHadith(paras, 10), null);

  const muslim = extractHadith(["١ - (٨) أ", "ب", "٢ - (٨) ج", "٣ - (٩) د"], "8");
  assert.deepEqual(muslim.paragraphs, ["١ - (٨) أ", "ب", "٢ - (٨) ج"]);
  assert.deepEqual(muslim.routes_on_page, ["1", "2"]);
});

// --- ayah references ------------------------------------------------------

test("prose form «سورة X: N» / «الآية» / ranges", () => {
  assert.deepEqual(detectAyahs("قوله تعالى في سورة البقرة: ٢٥٥"), ["2:255"]);
  assert.deepEqual(detectAyahs("سورة آل عمران: 5"), ["3:5"]);
  assert.deepEqual(detectAyahs("سورة المائدة الآية ٣"), ["5:3"]);
  assert.deepEqual(detectAyahs("سورة البقرة 10-12"), ["2:10", "2:11", "2:12"]);
  assert.equal(detectAyahs("سورة البقرة 1-200").length, 50);
});

test("bracket form «[البقرة: ٢٥٥]» (the layout Ibn Kathir ت السلامة actually uses)", () => {
  assert.deepEqual(detectAyahs("كما قال تعالى: ﴿…﴾ [الرحمن: ٥٤]"), ["55:54"]);
  assert.deepEqual(detectAyahs("سنقرئك فلا تنسى * إلا ما شاء الله [الأعلى: ٦، ٧]"), ["87:6", "87:7"]);
  assert.deepEqual(detectAyahs("[آل عمران: ١٣٠ - ١٣٢]"), ["3:130", "3:131", "3:132"]);
  assert.deepEqual(detectAyahs("[ص: ٢٩]"), ["38:29"], "single-letter surah is unambiguous inside brackets");
});

test("editorial / cross-reference brackets are not ayah refs", () => {
  assert.deepEqual(detectAyahs("[رقم ٢١]"), []);
  assert.deepEqual(detectAyahs("[وإن؟؟]"), []);
  assert.deepEqual(detectAyahs("(٣/ ٤٤٢)"), []);
});

test("out-of-range dropped (never clamped); prose single-letter names never matched", () => {
  assert.deepEqual(detectAyahs("سورة البقرة: 300"), []);
  assert.deepEqual(detectAyahs("سورة الناس: 7"), []);
  assert.deepEqual(detectAyahs("سورة ص 1"), []);
  assert.deepEqual(detectAyahs("سورة ق 1"), []);
  assert.deepEqual(detectAyahs("ذكر المفسر أقوال العلماء"), []);
  assert.deepEqual(detectAyahs(null), []);
});

test("Qur'anic-bracket ayah markers «﴿…(١٣٠)…﴾» on a page of known surah", () => {
  const paras = [
    "﴿يَا أَيُّهَا الَّذِينَ آمَنُوا لا تَأْكُلُوا الرِّبَا أَضْعَافًا مُضَاعَفَةً وَاتَّقُوا اللَّهَ لَعَلَّكُمْ تُفْلِحُونَ (١٣٠) وَاتَّقُوا النَّارَ الَّتِي أُعِدَّتْ لِلْكَافِرِينَ (١٣١)﴾",
    "(١) في جـ: \"قال\" — footnote-like numbers outside ﴿﴾ must not count",
    "﴿الم (١)﴾",
  ];
  assert.deepEqual(detectQuranBracketAyahs(paras, 3), [1, 130, 131]);
  assert.deepEqual(detectQuranBracketAyahs(paras, 114), [1], "out-of-range for short surah dropped");
  assert.deepEqual(detectQuranBracketAyahs(paras, 0), []);
});

test("surahFromHeading parses real TOC titles from book 8473", () => {
  assert.equal(surahFromHeading("تفسير سورة البقرة"), 2);
  assert.equal(surahFromHeading("تفسير سورة آل عمران"), 3);
  assert.equal(surahFromHeading("سورة الأنبياء"), 21);
  assert.equal(surahFromHeading("تفسير سورة إبراهيم ﵇"), 14);
  assert.equal(surahFromHeading("تفسير سورة مريم [﵍]"), 19);
  assert.equal(surahFromHeading("تفسير سورة ص"), 38);
  assert.equal(surahFromHeading("تفسير سورة ق"), 50);
  assert.equal(surahFromHeading("فاتحة الكتاب"), 0, "no «سورة» keyword → not a heading match");
  assert.equal(surahFromHeading("من لم ير بأسا أن يقول: سورة البقرة، وسورة كذا"), 2, "loose but acceptable: caller filters by TOC depth");
  assert.equal(surahFromHeading("مقدمة ابن كثير"), 0);
});

test("SURAH_NAMES covers all 114 surahs exactly once; AYAH_COUNTS sums to 6236", () => {
  const numbers = SURAH_NAMES.map(([n]) => n);
  assert.equal(numbers.length, 114);
  assert.equal(new Set(numbers).size, 114);
  assert.equal(AYAH_COUNTS.reduce((a, b) => a + b, 0), 6236);
});
