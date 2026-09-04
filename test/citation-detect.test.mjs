import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectHadithMarkers,
  detectHadithNumbers,
  extractHadith,
  detectAyahs,
  detectAyahReferences,
  detectQuranBracketAyahs,
  ayahHeadingInParagraph,
  quranBracketAyahsInParagraph,
  surahFromHeading,
  surahsFromHeading,
  surahHeadingInParagraph,
  extractGradings,
  gradingForHadith,
  gradingAcrossPages,
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
  assert.deepEqual(detectAyahs("سورة البقرة 10-12"), [], "bare prose numbers are not explicit enough");
  const long = detectAyahReferences("سورة البقرة: 1-200");
  assert.equal(long.refs.length, 50);
  assert.equal(long.truncated, true);
  assert.deepEqual(long.metadata[0], {
    source: "prose",
    surah: 2,
    from: 1,
    to: 200,
    raw: "سورة البقرة: 1-200",
    truncated: true,
    included_count: 50,
    omitted_count: 150,
    note: "Range expansion is bounded to 50; inspect the explicit from/to bounds.",
  });
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
  assert.equal(surahFromHeading("فاتحة الكتاب"), 1, "8473's only heading for al-Fatiha has no «سورة» keyword");
  assert.equal(surahFromHeading("من لم ير بأسا أن يقول: سورة البقرة، وسورة كذا"), 2, "loose but acceptable: caller filters by TOC depth");
  assert.equal(surahFromHeading("مقدمة ابن كثير"), 0);
  assert.equal(surahFromHeading("الآية: ٢٥٥"), 0);
  assert.equal(surahFromHeading(""), 0);
});

test("surahFromHeading: every heading shape that book 8473 really uses (live TOC, 2026-09-03)", () => {
  const cases = [
    ["تفسير سورة فاطر وهي مكية", 35],
    ["تفسير سورة القتال", 47],
    ['تفسير سورة "ن"', 68],
    ["تفسير سورة سأل سائل", 70],
    ["تفسير سورة سبح", 87],
    ["تفسير سورة والشمس وضحاها", 91],
    ["تفسير سورة ألم نشرح", 94],
    ["تفسير سورة والتين والزيتون", 95],
    ["تفسير سورة اقرأ", 96],
    ["تفسير سورة لم يكن", 98],
    ["تفسير سورة إذا زلزلت", 99],
    ["تفسير سورة ويل لكل همزة لمزة", 104],
    ["تفسير سورة لإيلاف قريش", 106],
    ["تفسير السورة التي يذكر فيها الماعون", 107],
    ["تفسير سورة قل يا أيها الكافرون", 109],
    ["تفسير سورة إذا جاء نصر الله والفتح", 110],
    ["تفسير سورة تبت", 111],
    ["سورة الناس", 114],
    ["سورة الشعراء", 26],
    ["تفسير سورة العنكبوت", 29],
  ];
  for (const [heading, expected] of cases) assert.equal(surahFromHeading(heading), expected, heading);
  assert.deepEqual(surahsFromHeading("تفسير سورتي المعوذتين"), [113, 114]);
  assert.deepEqual(surahsFromHeading("تفسير سورة الفلق"), [113]);
});

test("surahFromHeading: every heading shape in Tabari 7798's live TOC (2026-09-03) — Kufan-formula prefixes and quoted opening words", () => {
  const cases = [
    ["القول في تأويل فاتحة الكتاب", 1],
    ["القول في تفسير السورة التي يذكر فيها البقرة", 2],
    ["تفسير السورة التى يذكر فيها المائدة", 5],
    ["القول في تفسير السورة التي يذكر فيها يونس ﷺ", 10],
    ["أول تفسير السورة التي يذكر فيها الرعد", 13],
    ["تفسير سورة بنى إسرائيل", 17],
    ['تفسير سورة "قد أفلح المؤمنون"', 23],
    ["تفسير سورة حم المؤمن", 40],
    ['تفسير سورة "حم عسق"', 42],
    ['تفسير سورة "والنجم"', 53],
    ["تفسير سورة اقتربت الساعة", 54],
    ['تفسير السورة التي يذكر فيها "الحديد"', 57],
    ['تفسير سورة "المنافقين"', 63],
    ['تفسير سورة "ن"', 68],
    ["تفسير سورة [هل أتى على الإنسان]", 76],
    ['تفسير سورة "والمرسلات"', 77],
    ['تفسير سورة "عم يتساءلون"', 78],
    ['تفسير سورة "إذا الشمس كورت"', 81],
    ['تفسير سورة "إذا السماء انفطرت"', 82],
    ['تفسير سورة "ويل للمطففين"', 83],
    ['تفسير سورة "إذا السماء انشقت"', 84],
    ['تفسير "سورة البروج"', 85],
    ['تفسير سورة "والسماء والطارق"', 86],
    ['تفسير سورة "والفجر"', 89],
    ['تفسير سورة "والتين"', 95],
    ['تفسير سورة "والعاديات"', 100],
    ['تفسير سورة "ألهاكم"', 102],
    ['تفسير سورة "والعصر"', 103],
    ['تفسير سورة "أرأيت"', 107],
    ['تفسير سورة "الناس"', 114],
  ];
  for (const [heading, expected] of cases) assert.equal(surahFromHeading(heading), expected, heading);
  // The formula prefix alone (an ayah sub-heading) must NOT become a surah.
  assert.equal(surahFromHeading("القول في تأويل قوله: ﴿إن الدين عند الله الإسلام﴾."), 0);
  assert.equal(surahFromHeading("القول في تأويل الاستعاذة"), 0);
  assert.equal(surahFromHeading("تفسير البسملة"), 0);
  assert.equal(surahFromHeading("ذكر من قال ذلك"), 0);
});

test("surahFromHeading: Qurtubi 20855 TOC shapes — «براءة», stray «و -», fused «والطور»", () => {
  const cases = [
    ["تفسير سورة براءة", 9],
    ["تفسير سورة يونس عليه السلام", 10],
    ["سورة يوسف عليه السلام", 12],
    ["تفسير سورة مريم عليها السلام", 19],
    ["سورة سبإ", 34],
    ["تفسير سورة الجاثية -", 45],
    ["تفسير سورة ق -", 50],
    ["تفسير سورة و - الذاريات", 51],
    ["تفسير سورة والطور", 52],
    ["تفسير سورة والنجم", 53],
    ["تفسير سورة المنافقين", 63],
    ["تفسير سورة ن والقلم", 68],
    ["تفسير سورة عم و - تسمى سورة النبأ", 78],
    ["تفسير سورة والليل", 92],
    ["تفسير سورة والعاديات", 100],
    ["تفسير سورة والعصر", 103],
    ["تفسير سورة تبت", 111],
  ];
  for (const [heading, expected] of cases) assert.equal(surahFromHeading(heading), expected, heading);
  // Qurtubi's per-ayah sub-headings are NOT surah headings.
  assert.equal(surahFromHeading("[سورة البقرة (٢): آية ٨٠]"), 2, "loose (name is there) — the builder only uses top-level TOC entries and in-text headings are filtered separately");
  assert.deepEqual(surahHeadingInParagraph("[سورة البقرة (٢): آية ٨٠]"), [], "an ayah heading inside the page text must not restart the surah");
});

test("ayahHeadingInParagraph / quranBracketAyahsInParagraph: Qurtubi's editorial «[سورة X (n): آية m]» headings (live pages 482 & 7449, 2026-09-03)", () => {
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): آية ٨٠]", 2), [80]);
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): الآيات ٨١ إلى ٨٢]", 2), [81, 82]);
  assert.deepEqual(ayahHeadingInParagraph("[سورة الناس (١١٤): الآيات ١ الى ٣]", 114), [1, 2, 3]);
  assert.deepEqual(ayahHeadingInParagraph("[سورة البقرة (٢): آية ٨٠]", 3), [], "surah number in the heading must match");
  assert.deepEqual(ayahHeadingInParagraph("[سورة الناس (١١٤): آية ٩]", 114), [], "beyond the surah's length → dropped, never clamped");
  assert.deepEqual(ayahHeadingInParagraph("سورة البقرة: ٢٥٥", 2), [], "a bare reference is not a heading");
  assert.deepEqual(ayahHeadingInParagraph("قال في سورة البقرة (٢): آية ٨٠ ما نصه …", 2), [], "must be the whole paragraph");
  assert.deepEqual(quranBracketAyahsInParagraph("[سورة البقرة (٢): آية ٨٠]", 2), [80]);
  assert.deepEqual(
    detectQuranBracketAyahs(["[تفسير سورة الناس]", "بِسْمِ اللَّهِ الرَّحْمنِ الرَّحِيمِ", "[سورة الناس (١١٤): الآيات ١ الى ٣]", "قُلْ أَعُوذُ بِرَبِّ النَّاسِ (١) مَلِكِ النَّاسِ (٢) إِلهِ النَّاسِ (٣)"], 114),
    [1, 2, 3],
    "the un-bracketed ayah text's (n) numbers are NOT counted; only the heading is",
  );
});

test("surahHeadingInParagraph: in-text surah headings only, never prose mentions", () => {
  assert.deepEqual(surahHeadingInParagraph("سورة الشعراء"), [26], "8473 p.3040 — no TOC entry");
  assert.deepEqual(surahHeadingInParagraph("تفسير سورة العنكبوت"), [29], "8473 p.3167 last paragraph");
  assert.deepEqual(surahHeadingInParagraph("[فاتحة الكتاب]"), [1]);
  assert.deepEqual(surahHeadingInParagraph('أما الكلام على الحروف المقطعة فقد تقدم في أول سورة "البقرة".'), []);
  assert.deepEqual(surahHeadingInParagraph('[والله أعلم. آخر تفسير سورة "القصص"] (٧)'), []);
  assert.deepEqual(surahHeadingInParagraph("سورة البقرة: ٢٥٥"), [], "a reference, not a heading");
  assert.deepEqual(surahHeadingInParagraph("﴿طسم (١)﴾"), []);
});

test("SURAH_NAMES covers all 114 surahs exactly once; AYAH_COUNTS sums to 6236", () => {
  const numbers = SURAH_NAMES.map(([n]) => n);
  assert.equal(numbers.length, 114);
  assert.equal(new Set(numbers).size, 114);
  assert.equal(AYAH_COUNTS.reduce((a, b) => a + b, 0), 6236);
});

// --- editorial gradings (al-Albani) — real footnote shapes, read live 2026-09-03 ---

test("extractGradings: Tirmidhi 1435/3 «[حكم الألباني] : صحيح»", () => {
  const g = extractGradings(["[حكم الألباني] : صحيح"]);
  assert.equal(g.length, 1);
  assert.equal(g[0].grader, "الألباني");
  assert.equal(g[0].verdict, "صحيح");
  assert.equal(g[0].verdict_class, "sahih");
  assert.equal(g[0].where, "footnote");
});

test("extractGradings: Abu Dawud 1726/3 «[حكم الألباني] : حسن صحيح»", () => {
  const [g] = extractGradings(["[حكم الألباني] : حسن صحيح"]);
  assert.equal(g.verdict, "حسن صحيح");
  assert.equal(g.verdict_class, "hasan_sahih");
});

test("extractGradings finds every explicit label in one multi-entry footnote block", () => {
  const gradings = extractGradings([
    "(١) تخريج مختصر\n[حكم الألباني] : صحيح\n(٢) زيادة المحقق\n[حكم الألباني] : ضعيف",
  ]);
  assert.deepEqual(gradings.map((g) => g.verdict), ["صحيح", "ضعيف"]);
  assert.deepEqual(gradings.map((g) => g.verdict_class), ["sahih", "daif"]);
});

test("extractGradings: Ibn Majah 1198/4 — label on its own line, verdict on the next", () => {
  const [g] = extractGradings(["[حكم الألباني]\nصحيح"]);
  assert.equal(g.verdict, "صحيح");
  const [g2] = extractGradings(["(١) في نسخة: كذا\n[حكم الألباني]\nضعيف جدا"]);
  assert.equal(g2.verdict, "ضعيف جدا");
  assert.equal(g2.verdict_class, "daif");
});

test("extractGradings: «قال الألباني: …» / «قال الشيخ الألباني: …» in a footnote", () => {
  assert.equal(extractGradings(["قال الشيخ الألباني: ضعيف"])[0].verdict_class, "daif");
  assert.equal(extractGradings(["قال الألباني: حديث موضوع."])[0].verdict_class, "mawdu");
  assert.equal(extractGradings(["قال الألباني: صحيح دون قوله: \"وكان يحب\""])[0].verdict, "صحيح دون قوله: \"وكان يحب\"");
});

test("extractGradings NEGATIVES: never guess from commentary or the compiler's own words", () => {
  // Nasa'i 829/7 — no Albani footnote at all
  assert.deepEqual(extractGradings([], ["حَدَّثَنَا … ⦗٧⦘ … قَالَ"]), []);
  // Musnad 25794/153 — editor's biography footnote
  assert.deepEqual(extractGradings(["(١) هو أبو بكر الصديق، عبد الله بن عثمان، أول الخلفاء الراشدين"]), []);
  // Tirmidhi's own judgement in the matn
  assert.deepEqual(extractGradings([], ["١ - حَدَّثَنَا … هَذَا حَدِيثٌ حَسَنٌ صَحِيحٌ"]), []);
  // prose that merely mentions al-Albani
  assert.deepEqual(extractGradings(["وقال الألباني في الإرواء (٣/ ٤٥) بعد أن ساقه من طريق آخر"]), []);
  assert.deepEqual(extractGradings(["انظر: صحيح الجامع للألباني برقم (١٢٣)"]), []);
  // a muhaqqiq's own grading is not Albani's
  assert.deepEqual(extractGradings(["(٢) إسناده صحيح على شرط الشيخين"]), []);
  // «قال الألباني» in the MAIN text is not honoured (only the bracketed label is)
  assert.deepEqual(extractGradings([], ["قال الألباني: صحيح"]), []);
});

test("gradingForHadith attributes only when unambiguous", () => {
  const one = gradingForHadith({ footnotes: ["[حكم الألباني] : صحيح"], numbersOnPage: ["12"], hadithNumber: "12" });
  assert.equal(one.grading.verdict, "صحيح");
  assert.equal(one.grading.attribution, "only_grading_on_page");

  const ordered = gradingForHadith({ footnotes: ["[حكم الألباني] : صحيح", "[حكم الألباني] : ضعيف"], numbersOnPage: ["12", "13"], hadithNumber: "13" });
  assert.equal(ordered.grading.verdict, "ضعيف");
  assert.equal(ordered.grading.attribution, "by_order_on_page");

  const ambiguous = gradingForHadith({ footnotes: ["[حكم الألباني] : صحيح"], numbersOnPage: ["12", "13"], hadithNumber: "13" });
  assert.equal(ambiguous.grading, null);
  assert.equal(ambiguous.gradings_on_page.length, 1);
  assert.ok(ambiguous.grading_note);

  const none = gradingForHadith({ footnotes: ["(١) في أ: كذا"], numbersOnPage: ["12"], hadithNumber: "12" });
  assert.deepEqual(none, { grading: null, gradings_on_page: [] });
});

test("gradingAcrossPages: verdict printed on the continuation page still belongs to the running hadith", () => {
  const r = gradingAcrossPages(
    [
      { page: "100", footnotes: ["(١) في م: كذا"], numbers: ["40"] },
      { page: "101", footnotes: ["[حكم الألباني] : حسن"], numbers: [] },
    ],
    "40",
  );
  assert.equal(r.grading.verdict, "حسن");
  assert.equal(r.grading.page, "101");
  // …but if the continuation page opens a new hadith too, one verdict is ambiguous
  const amb = gradingAcrossPages(
    [
      { page: "100", footnotes: [], numbers: ["40"] },
      { page: "101", footnotes: ["[حكم الألباني] : حسن"], numbers: ["41"] },
    ],
    "40",
  );
  assert.equal(amb.grading, null);
});
