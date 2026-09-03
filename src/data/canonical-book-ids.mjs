/**
 * HAND-VERIFIED shamela.ws book_ids for the canonical (standard-numbering)
 * edition of each high-traffic reference work.
 *
 * Verification method (2026-09-03, live against shamela.ws):
 *   1. `GET /ajax/book/?term=<title>` → list every edition shamela hosts.
 *   2. Open each candidate's index page → read محقق / ناشر / ترقيم note.
 *   3. `GET /ajax/specialnumber2id/<book_id>/<n>` → confirm the edition is
 *      wired into shamela's "رقم الحديث" lookup and the page it returns really
 *      starts with hadith <n> (spot-checked: 1681/8→19, 1681/7563→11208,
 *      1727/2→12, 1727/3033→7494, 1435/1→3, 1726/1→3, 829/1→7, 1198/1→4,
 *      1699/1→2643 (last kitab, numbering restarts per kitab — see note),
 *      1699/1000→1281, 25794/1→153). Tafsir 8473 has no hadith numbering
 *      (`specialnumber2id` → -1), as expected.
 *
 * Do NOT regenerate this file blindly from title heuristics — the previous
 * heuristic (match محقق name) was wrong on real data: e.g. 1681's محقق is
 * محمد زهير الناصر while its *numbering* is Fuad Abd al-Baqi's.
 * `scripts/resolve-canonical-editions.mjs` now only *re-checks* these ids.
 *
 * Schema:
 *   editions[key] = {
 *     book_id, title, numbering, numbering_roman, note,
 *     type: "hadith" | "tafsir",
 *     last_number?: number,           // highest hadith number in this numbering
 *     other_editions: [{ book_id, title, note }]   // same work, NOT canonical
 *   }
 */
export default {
  generated_at: "2026-09-03T00:00:00.000Z",
  source: "hand-verified: shamela.ws /ajax/book + /ajax/specialnumber2id",
  editions: {
    "sahih-al-bukhari": {
      type: "hadith",
      book_id: "1681",
      title: "صحيح البخاري - ط السلطانية (دار طوق النجاة)",
      numbering: "ترقيم محمد فؤاد عبد الباقي",
      numbering_roman: "Muhammad Fuad Abd al-Baqi",
      last_number: 7563,
      note: "ترقيم الكتاب موافق للمطبوع وهو ضمن خدمة التخريج — this is the numbering used by worldwide translations.",
      other_editions: [
        { book_id: "735", title: "صحيح البخاري - ت البغا", note: "Mustafa al-Bugha numbering (differs; ends at 7124)." },
        { book_id: "1284", title: "صحيح البخاري - ط التأصيل", note: "different pagination/numbering." },
        { book_id: "1376", title: "صحيح البخاري - ن عطاءات العلم", note: "different edition." },
        { book_id: "907", title: "صحيح البخاري بحاشية السهارنفوري", note: "Indian print with hashiya." },
      ],
    },
    "sahih-muslim": {
      type: "hadith",
      book_id: "1727",
      title: "صحيح مسلم - ت عبد الباقي",
      numbering: "ترقيم محمد فؤاد عبد الباقي",
      numbering_roman: "Muhammad Fuad Abd al-Baqi",
      last_number: 3033,
      note: "Abd al-Baqi's 1–3033 book-level numbering (the one cited worldwide). Repeated-chain sub-numbers are printed as ٢ - (…) inside a hadith.",
      other_editions: [
        { book_id: "711", title: "صحيح مسلم - ط التركية", note: "Istanbul print; no Abd al-Baqi numbering." },
      ],
    },
    "sunan-abi-dawud": {
      type: "hadith",
      book_id: "1726",
      title: "سنن أبي داود - ت محيي الدين عبد الحميد",
      numbering: "ترقيم محمد محيي الدين عبد الحميد",
      numbering_roman: "Muhammad Muhyi al-Din Abd al-Hamid",
      last_number: 5274,
      note: "Standard 1–5274 numbering.",
      other_editions: [
        { book_id: "117359", title: "سنن أبي داود - ت الأرنؤوط", note: "Arna'ut edition (same numbering printed, but different pagination)." },
        { book_id: "654", title: "سنن أبي داود - ط دهلي مع عون المعبود", note: "with commentary." },
        { book_id: "25881", title: "صحيح سنن أبي داود - ط غراس", note: "Albani's graded selection, not the full Sunan." },
      ],
    },
    "jami-at-tirmidhi": {
      type: "hadith",
      book_id: "1435",
      title: "سنن الترمذي - ت شاكر",
      numbering: "ترقيم أحمد محمد شاكر",
      numbering_roman: "Ahmad Muhammad Shakir",
      last_number: 3956,
      note: "Shakir/Abd al-Baqi/Iwad numbering 1–3956 with Albani's grading appended per hadith.",
      other_editions: [
        { book_id: "7895", title: "سنن الترمذي - ت بشار", note: "Bashshar Awwad edition; numbering differs slightly." },
        { book_id: "1363", title: "سنن الترمذي - ط الرسالة", note: "different numbering." },
        { book_id: "1216", title: "ضعيف سنن الترمذي", note: "Albani's graded selection." },
      ],
    },
    "sunan-an-nasai": {
      type: "hadith",
      book_id: "829",
      title: "سنن النسائي (المجتبى) - ط المصرية",
      numbering: "ترقيم عبد الفتاح أبو غدة (المكتب الإسلامي)",
      numbering_roman: "Abd al-Fattah Abu Ghuddah",
      last_number: 5758,
      note: "Standard 1–5758 numbering of al-Mujtaba.",
      other_editions: [
        { book_id: "1339", title: "سنن النسائي - ط الرسالة", note: "different numbering." },
        { book_id: "1147", title: "صحيح سنن النسائي", note: "Albani's graded selection." },
        { book_id: "1148", title: "ضعيف سنن النسائي", note: "Albani's graded selection." },
        { book_id: "8623", title: "السنن الكبرى (fragment)", note: "al-Kubra, a different work." },
      ],
    },
    "sunan-ibn-majah": {
      type: "hadith",
      book_id: "1198",
      title: "سنن ابن ماجه - ت عبد الباقي",
      numbering: "ترقيم محمد فؤاد عبد الباقي",
      numbering_roman: "Muhammad Fuad Abd al-Baqi",
      last_number: 4341,
      note: "Standard 1–4341 numbering.",
      other_editions: [
        { book_id: "98138", title: "سنن ابن ماجه - ت الأرنؤوط", note: "Arna'ut edition." },
        { book_id: "1194", title: "سنن ابن ماجه - ت هادي", note: "different edition." },
      ],
    },
    "muwatta-malik": {
      type: "hadith",
      book_id: "1699",
      title: "موطأ مالك - رواية يحيى - ت عبد الباقي",
      numbering: "ترقيم محمد فؤاد عبد الباقي (متسلسل داخل كل كتاب)",
      numbering_roman: "Muhammad Fuad Abd al-Baqi",
      note: "CAUTION: in this print numbers restart inside every كتاب; shamela's specialnumber2id returns the LAST kitab's match for small numbers (1 → كتاب أسماء النبي). Always cite Muwatta as (كتاب, رقم) and verify the page's chapter path.",
      other_editions: [
        { book_id: "28107", title: "موطأ مالك - رواية يحيى - ت الأعظمي", note: "continuous numbering by al-A'zami (differs)." },
        { book_id: "16050", title: "موطأ مالك - رواية محمد بن الحسن", note: "different riwaya." },
        { book_id: "8140", title: "موطأ مالك - رواية أبي مصعب", note: "different riwaya." },
      ],
    },
    "musnad-ahmad": {
      type: "hadith",
      book_id: "25794",
      title: "مسند الإمام أحمد بن حنبل - ط الرسالة (ت الأرنؤوط)",
      numbering: "ترقيم مؤسسة الرسالة (شعيب الأرنؤوط)",
      numbering_roman: "Mu'assasat al-Risala (Shu'ayb al-Arna'ut)",
      last_number: 27647,
      note: "Complete 45-volume Risala edition; continuous 1–27647 numbering (the one most modern takhrij cites). Ahmad Shakir's numbering is a DIFFERENT scheme — see other_editions.",
      other_editions: [
        { book_id: "98139", title: "مسند أحمد - ت شاكر (ط دار الحديث)", note: "Ahmad Shakir numbering; Shakir died before completing it." },
      ],
    },
    "tafsir-ibn-kathir": {
      type: "tafsir",
      book_id: "8473",
      title: "تفسير القرآن العظيم (ابن كثير) - ت سامي السلامة (دار طيبة)",
      numbering: "لا ترقيم أحاديث؛ يُستدل بالسورة والآية",
      numbering_roman: "Sami al-Salama (Dar Tayba), 8 vols",
      note: "Ayah-addressable only (no specialnumber2id). Last page id 4588.",
      other_editions: [
        { book_id: "1503", title: "تفسير ابن كثير - ط العلمية", note: "" },
        { book_id: "1509", title: "تفسير ابن كثير - ت شمس الدين", note: "" },
        { book_id: "23604", title: "تفسير ابن كثير - ط دار طيبة (other scan)", note: "" },
        { book_id: "21549", title: "مختصر تفسير ابن كثير", note: "abridgement, not the tafsir itself." },
      ],
    },
  },
};
