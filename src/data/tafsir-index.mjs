/**
 * Persisted tafsir index: surah → shamela page range, and surah:ayah → the
 * first page whose Qur'anic bracket «﴿…(n)…﴾» carries that ayah number.
 *
 * GENERATED / MERGED by scripts/build-tafsir-index.mjs — do not hand-edit
 * entries. The tool layer never walks a book at request time: it answers
 * from `ayahs` in O(1), or bisects inside the surah's `surahs[n]` range
 * (≤ 20 page fetches) and never leaves that range.
 *
 * Schema:
 *   books["<book_id>"] = {
 *     type: "tafsir", key?, title?, last_page, source,
 *     surahs: { "<n>": { start, end, heading, source: "toc"|"toc_shared_heading"|"page_heading" } },
 *     ayahs:  { "<surah>:<ayah>": "<page_id>" }
 *   }
 */
export default {
 "generated_at": "2026-09-03T00:00:00.000Z",
 "books": {
  "7798": {
   "type": "tafsir",
   "key": "tafsir-al-tabari",
   "title": "تفسير الطبري = جامع البيان عن تأويل آي القرآن - ت التركي (دار هجر)",
   "last_page": "16700",
   "source": "surah ranges: live TOC of shamela.ws/book/7798 (2026-09-03; every surah has a TOC entry); ayahs: 114:1-6 read live on page 16697, 3:18-44 from the TOC's «القول في تأويل قوله: ﴿…(n)﴾» sub-headings (each links to the page that opens with that heading). Run scripts/build-tafsir-index.mjs --tafsir 7798 to fill the rest.",
   "surahs": {
    "1": {
     "start": "315",
     "end": "383",
     "heading": "القول في تأويل فاتحة الكتاب",
     "source": "toc"
    },
    "2": {
     "start": "384",
     "end": "3286",
     "heading": "القول في تفسير السورة التي يذكر فيها البقرة",
     "source": "toc"
    },
    "3": {
     "start": "3287",
     "end": "4176",
     "heading": "سورة آل عمران",
     "source": "toc"
    },
    "4": {
     "start": "4177",
     "end": "5291",
     "heading": "القول في تفسير السورة التي يذكر فيها النساء",
     "source": "toc"
    },
    "5": {
     "start": "5292",
     "end": "6176",
     "heading": "تفسير السورة التى يذكر فيها المائدة",
     "source": "toc"
    },
    "6": {
     "start": "6177",
     "end": "6759",
     "heading": "تفسير سورة الأنعام",
     "source": "toc"
    },
    "7": {
     "start": "6760",
     "end": "7379",
     "heading": "تفسير السورة التي يذكر فيها الأعراف",
     "source": "toc"
    },
    "8": {
     "start": "7380",
     "end": "7677",
     "heading": "القول في تفسير السورة التي يذكر فيها الأنفال",
     "source": "toc"
    },
    "9": {
     "start": "7678",
     "end": "8175",
     "heading": "القول في تفسير السورة التي يذكر فيها التوبة",
     "source": "toc"
    },
    "10": {
     "start": "8176",
     "end": "8380",
     "heading": "القول في تفسير السورة التي يذكر فيها يونس ﷺ",
     "source": "toc"
    },
    "11": {
     "start": "8381",
     "end": "8722",
     "heading": "تفسير السورة التي يذكر فيها هود ﵇",
     "source": "toc"
    },
    "12": {
     "start": "8723",
     "end": "9122",
     "heading": "تفسير السورة التى يذكر فيها يوسف ﷺ",
     "source": "toc"
    },
    "13": {
     "start": "9123",
     "end": "9305",
     "heading": "أول تفسير السورة التي يذكر فيها الرعد",
     "source": "toc"
    },
    "14": {
     "start": "9306",
     "end": "9465",
     "heading": "تفسير سورة إبراهيم ﵇",
     "source": "toc"
    },
    "15": {
     "start": "9466",
     "end": "9618",
     "heading": "تفسير سورة الحجر",
     "source": "toc"
    },
    "16": {
     "start": "9619",
     "end": "9871",
     "heading": "تفسير سورة النحل",
     "source": "toc"
    },
    "17": {
     "start": "9872",
     "end": "10269",
     "heading": "تفسير سورة بنى إسرائيل",
     "source": "toc"
    },
    "18": {
     "start": "10270",
     "end": "10572",
     "heading": "تفسير سورة الكهف",
     "source": "toc"
    },
    "19": {
     "start": "10573",
     "end": "10779",
     "heading": "تفسير سورة مريم ﵍",
     "source": "toc"
    },
    "20": {
     "start": "10780",
     "end": "10995",
     "heading": "تفسير سورة طه",
     "source": "toc"
    },
    "21": {
     "start": "10996",
     "end": "11220",
     "heading": "تفسير سورة الأنبياء عليهم الصلاة والسلام",
     "source": "toc"
    },
    "22": {
     "start": "11221",
     "end": "11423",
     "heading": "تفسير سورة \"الحج\"",
     "source": "toc"
    },
    "23": {
     "start": "11424",
     "end": "11554",
     "heading": "تفسير سورة \"قد أفلح المؤمنون\"",
     "source": "toc"
    },
    "24": {
     "start": "11555",
     "end": "11812",
     "heading": "تفسير سورة النور",
     "source": "toc"
    },
    "25": {
     "start": "11813",
     "end": "11960",
     "heading": "تفسير سورة الفرقان",
     "source": "toc"
    },
    "26": {
     "start": "11961",
     "end": "12102",
     "heading": "تفسير سورة الشعراء",
     "source": "toc"
    },
    "27": {
     "start": "12103",
     "end": "12246",
     "heading": "تفسير سورة النمل",
     "source": "toc"
    },
    "28": {
     "start": "12247",
     "end": "12452",
     "heading": "تفسير سورة القصص",
     "source": "toc"
    },
    "29": {
     "start": "12453",
     "end": "12543",
     "heading": "تفسير سورة العنكبوت",
     "source": "toc"
    },
    "30": {
     "start": "12544",
     "end": "12628",
     "heading": "تفسير \"سورة الروم\"",
     "source": "toc"
    },
    "31": {
     "start": "12629",
     "end": "12686",
     "heading": "تفسير سورة لقمان",
     "source": "toc"
    },
    "32": {
     "start": "12687",
     "end": "12744",
     "heading": "تفسير سورة السجدة",
     "source": "toc"
    },
    "33": {
     "start": "12745",
     "end": "12946",
     "heading": "تفسير سورة الأحزاب",
     "source": "toc"
    },
    "34": {
     "start": "12947",
     "end": "13065",
     "heading": "تفسير سورة سبأ",
     "source": "toc"
    },
    "35": {
     "start": "13066",
     "end": "13137",
     "heading": "تفسير سورة فاطر",
     "source": "toc"
    },
    "36": {
     "start": "13138",
     "end": "13231",
     "heading": "تفسير سورة \"يس\"",
     "source": "toc"
    },
    "37": {
     "start": "13232",
     "end": "13402",
     "heading": "تفسير سورة الصافات",
     "source": "toc"
    },
    "38": {
     "start": "13403",
     "end": "13551",
     "heading": "تفسير سورة \"ص\"",
     "source": "toc"
    },
    "39": {
     "start": "13552",
     "end": "13671",
     "heading": "تفسير سورة \"الزمر\"",
     "source": "toc"
    },
    "40": {
     "start": "13672",
     "end": "13772",
     "heading": "تفسير سورة حم المؤمن",
     "source": "toc"
    },
    "41": {
     "start": "13773",
     "end": "13861",
     "heading": "تفسير سورة \"فصلت\"",
     "source": "toc"
    },
    "42": {
     "start": "13862",
     "end": "13942",
     "heading": "تفسير سورة \"حم عسق\"",
     "source": "toc"
    },
    "43": {
     "start": "13943",
     "end": "14063",
     "heading": "تفسير سورة \"الزخرف\"",
     "source": "toc"
    },
    "44": {
     "start": "14064",
     "end": "14130",
     "heading": "سورة الدخان",
     "source": "toc"
    },
    "45": {
     "start": "14131",
     "end": "14169",
     "heading": "تفسير سورة \"الجاثية\"",
     "source": "toc"
    },
    "46": {
     "start": "14170",
     "end": "14238",
     "heading": "تفسير سورة الأحقاف",
     "source": "toc"
    },
    "47": {
     "start": "14239",
     "end": "14294",
     "heading": "تفسير سورة محمد ﷺ",
     "source": "toc"
    },
    "48": {
     "start": "14295",
     "end": "14393",
     "heading": "تفسير سورة \"الفتح\"",
     "source": "toc"
    },
    "49": {
     "start": "14394",
     "end": "14458",
     "heading": "تفسير سورة \"الحجرات\"",
     "source": "toc"
    },
    "50": {
     "start": "14459",
     "end": "14537",
     "heading": "تفسير سورة \"ق\"",
     "source": "toc"
    },
    "51": {
     "start": "14538",
     "end": "14618",
     "heading": "تفسير سورة الذاريات",
     "source": "toc"
    },
    "52": {
     "start": "14619",
     "end": "14669",
     "heading": "تفسير سورة «الطور»",
     "source": "toc"
    },
    "53": {
     "start": "14670",
     "end": "14767",
     "heading": "تفسير سورة \"والنجم\"",
     "source": "toc"
    },
    "54": {
     "start": "14768",
     "end": "14832",
     "heading": "تفسير سورة اقتربت الساعة",
     "source": "toc"
    },
    "55": {
     "start": "14833",
     "end": "14943",
     "heading": "تفسير سورة الرحمن",
     "source": "toc"
    },
    "56": {
     "start": "14944",
     "end": "15048",
     "heading": "تفسير سورة \"الواقعة\"",
     "source": "toc"
    },
    "57": {
     "start": "15049",
     "end": "15110",
     "heading": "تفسير السورة التي يذكر فيها \"الحديد\"",
     "source": "toc"
    },
    "58": {
     "start": "15111",
     "end": "15160",
     "heading": "تفسير سورة \"المجادلة\"",
     "source": "toc"
    },
    "59": {
     "start": "15161",
     "end": "15221",
     "heading": "تفسير سورة \"الحشر\"",
     "source": "toc"
    },
    "60": {
     "start": "15222",
     "end": "15270",
     "heading": "تفسير سورة \"الممتحنة\"",
     "source": "toc"
    },
    "61": {
     "start": "15271",
     "end": "15289",
     "heading": "تفسير سورة الصف",
     "source": "toc"
    },
    "62": {
     "start": "15290",
     "end": "15314",
     "heading": "تفسير سورة الجمعة",
     "source": "toc"
    },
    "63": {
     "start": "15315",
     "end": "15338",
     "heading": "تفسير سورة \"المنافقين\"",
     "source": "toc"
    },
    "64": {
     "start": "15339",
     "end": "15355",
     "heading": "تفسير سورة \"التغابن\"",
     "source": "toc"
    },
    "65": {
     "start": "15356",
     "end": "15416",
     "heading": "تفسير سورة \"الطلاق\"",
     "source": "toc"
    },
    "66": {
     "start": "15417",
     "end": "15451",
     "heading": "تفسير سورة التحريم",
     "source": "toc"
    },
    "67": {
     "start": "15452",
     "end": "15473",
     "heading": "تفسير سورة \"الملك\"",
     "source": "toc"
    },
    "68": {
     "start": "15474",
     "end": "15538",
     "heading": "تفسير سورة \"ن\"",
     "source": "toc"
    },
    "69": {
     "start": "15539",
     "end": "15581",
     "heading": "تفسير سورة \"الحاقة\"",
     "source": "toc"
    },
    "70": {
     "start": "15582",
     "end": "15621",
     "heading": "تفسير سورة سأل سائل",
     "source": "toc"
    },
    "71": {
     "start": "15622",
     "end": "15643",
     "heading": "تفسير سورة نوح ﷺ",
     "source": "toc"
    },
    "72": {
     "start": "15644",
     "end": "15690",
     "heading": "تفسير سورة الجن",
     "source": "toc"
    },
    "73": {
     "start": "15691",
     "end": "15733",
     "heading": "تفسير سورة \"المزمل\"",
     "source": "toc"
    },
    "74": {
     "start": "15734",
     "end": "15798",
     "heading": "تفسير سورة المدثر",
     "source": "toc"
    },
    "75": {
     "start": "15799",
     "end": "15862",
     "heading": "تفسير سورة \"القيامة\"",
     "source": "toc"
    },
    "76": {
     "start": "15863",
     "end": "15913",
     "heading": "تفسير سورة [هل أتى على الإنسان]",
     "source": "toc"
    },
    "77": {
     "start": "15914",
     "end": "15948",
     "heading": "تفسير سورة \"والمرسلات\"",
     "source": "toc"
    },
    "78": {
     "start": "15949",
     "end": "16000",
     "heading": "تفسير سورة \"عم يتساءلون\"",
     "source": "toc"
    },
    "79": {
     "start": "16001",
     "end": "16045",
     "heading": "تفسير سورة \"النازعات\"",
     "source": "toc"
    },
    "80": {
     "start": "16046",
     "end": "16071",
     "heading": "تفسير سورة \"عبس\"",
     "source": "toc"
    },
    "81": {
     "start": "16072",
     "end": "16117",
     "heading": "تفسير سورة \"إذا الشمس كورت\"",
     "source": "toc"
    },
    "82": {
     "start": "16118",
     "end": "16128",
     "heading": "تفسير سورة \"إذا السماء انفطرت\"",
     "source": "toc"
    },
    "83": {
     "start": "16129",
     "end": "16173",
     "heading": "تفسير سورة \"ويل للمطففين\"",
     "source": "toc"
    },
    "84": {
     "start": "16174",
     "end": "16203",
     "heading": "تفسير سورة \"إذا السماء انشقت\"",
     "source": "toc"
    },
    "85": {
     "start": "16204",
     "end": "16231",
     "heading": "تفسير \"سورة البروج\"",
     "source": "toc"
    },
    "86": {
     "start": "16232",
     "end": "16252",
     "heading": "تفسير سورة \"والسماء والطارق\"",
     "source": "toc"
    },
    "87": {
     "start": "16253",
     "end": "16269",
     "heading": "تفسير سورة \"سبح اسم ربك الأعلى\"",
     "source": "toc"
    },
    "88": {
     "start": "16270",
     "end": "16287",
     "heading": "تفسير سورة الغاشية",
     "source": "toc"
    },
    "89": {
     "start": "16288",
     "end": "16344",
     "heading": "تفسير سورة \"والفجر\"",
     "source": "toc"
    },
    "90": {
     "start": "16345",
     "end": "16377",
     "heading": "تفسير سورة \"البلد\"",
     "source": "toc"
    },
    "91": {
     "start": "16378",
     "end": "16398",
     "heading": "تفسير سورة \"والشمس وضحاها\"",
     "source": "toc"
    },
    "92": {
     "start": "16399",
     "end": "16424",
     "heading": "تفسير سورة \"والليل إذا يغشى\"",
     "source": "toc"
    },
    "93": {
     "start": "16425",
     "end": "16435",
     "heading": "تفسير سورة \"والضحى\"",
     "source": "toc"
    },
    "94": {
     "start": "16436",
     "end": "16444",
     "heading": "تفسير سورة \"ألم نشرح\"",
     "source": "toc"
    },
    "95": {
     "start": "16445",
     "end": "16470",
     "heading": "تفسير سورة \"والتين\"",
     "source": "toc"
    },
    "96": {
     "start": "16471",
     "end": "16485",
     "heading": "تفسير سورة \"اقرأ\"",
     "source": "toc"
    },
    "97": {
     "start": "16486",
     "end": "16494",
     "heading": "تفسير سورة \"القدر\"",
     "source": "toc"
    },
    "98": {
     "start": "16495",
     "end": "16501",
     "heading": "تفسير سورة \"لم يكن\"",
     "source": "toc"
    },
    "99": {
     "start": "16502",
     "end": "16513",
     "heading": "تفسير سورة \"إذا زلزلت\"",
     "source": "toc"
    },
    "100": {
     "start": "16514",
     "end": "16535",
     "heading": "تفسير سورة \"والعاديات\"",
     "source": "toc"
    },
    "101": {
     "start": "16536",
     "end": "16541",
     "heading": "تفسير سورة \"القارعة\"",
     "source": "toc"
    },
    "102": {
     "start": "16542",
     "end": "16555",
     "heading": "تفسير سورة \"ألهاكم\"",
     "source": "toc"
    },
    "103": {
     "start": "16556",
     "end": "16559",
     "heading": "تفسير سورة \"والعصر\"",
     "source": "toc"
    },
    "104": {
     "start": "16560",
     "end": "16570",
     "heading": "تفسير سورة \"ويل لكل همزة\"",
     "source": "toc"
    },
    "105": {
     "start": "16571",
     "end": "16589",
     "heading": "تفسير سورة \"الفيل\"",
     "source": "toc"
    },
    "106": {
     "start": "16590",
     "end": "16600",
     "heading": "تفسير سورة \"قريش\"",
     "source": "toc"
    },
    "107": {
     "start": "16601",
     "end": "16622",
     "heading": "تفسير سورة \"أرأيت\"",
     "source": "toc"
    },
    "108": {
     "start": "16623",
     "end": "16645",
     "heading": "تفسير سورة \"الكوثر\"",
     "source": "toc"
    },
    "109": {
     "start": "16646",
     "end": "16648",
     "heading": "تفسير سورة \"الكافرون\"",
     "source": "toc"
    },
    "110": {
     "start": "16649",
     "end": "16657",
     "heading": "تفسير سورة \"النصر\"",
     "source": "toc"
    },
    "111": {
     "start": "16658",
     "end": "16670",
     "heading": "تفسير سورة \"تبت\"",
     "source": "toc"
    },
    "112": {
     "start": "16671",
     "end": "16684",
     "heading": "تفسير سورة \"الإخلاص\"",
     "source": "toc"
    },
    "113": {
     "start": "16685",
     "end": "16696",
     "heading": "تفسير سورة \"الفلق\"",
     "source": "toc"
    },
    "114": {
     "start": "16697",
     "end": "16700",
     "heading": "تفسير سورة \"الناس\"",
     "source": "toc"
    }
   },
   "ayahs": {
    "3:18": "3392",
    "3:19": "3402",
    "3:20": "3405",
    "3:21": "3409",
    "3:22": "3409",
    "3:24": "3413",
    "3:25": "3415",
    "3:26": "3421",
    "3:27": "3430",
    "3:28": "3437",
    "3:29": "3437",
    "3:30": "3440",
    "3:31": "3441",
    "3:32": "3444",
    "3:33": "3445",
    "3:34": "3446",
    "3:35": "3447",
    "3:36": "3456",
    "3:37": "3475",
    "3:38": "3477",
    "3:39": "3493",
    "3:41": "3507",
    "3:42": "3509",
    "3:43": "3514",
    "3:44": "3522",
    "114:1": "16697",
    "114:2": "16697",
    "114:3": "16697",
    "114:4": "16697",
    "114:5": "16697",
    "114:6": "16697"
   }
  },
  "8473": {
   "type": "tafsir",
   "key": "tafsir-ibn-kathir",
   "title": "تفسير ابن كثير - ت السلامة (دار طيبة)",
   "last_page": "4588",
   "source": "surah ranges: live TOC of shamela.ws/book/8473 (2026-09-03) + page reads for the two surahs without a TOC entry (26 → 3040, 29 → 3168); ayahs: hand-verified page reads. Run scripts/build-tafsir-index.mjs to fill the remaining ayahs.",
   "surahs": {
    "1": {
     "start": "151",
     "end": "197",
     "heading": "فاتحة الكتاب",
     "source": "toc"
    },
    "2": {
     "start": "198",
     "end": "787",
     "heading": "تفسير سورة البقرة",
     "source": "toc"
    },
    "3": {
     "start": "788",
     "end": "986",
     "heading": "تفسير سورة آل عمران",
     "source": "toc"
    },
    "4": {
     "start": "987",
     "end": "1269",
     "heading": "تفسير سورة النساء",
     "source": "toc"
    },
    "5": {
     "start": "1270",
     "end": "1501",
     "heading": "تفسير سورة المائدة",
     "source": "toc"
    },
    "6": {
     "start": "1502",
     "end": "1650",
     "heading": "تفسير سورة الأنعام",
     "source": "toc"
    },
    "7": {
     "start": "1651",
     "end": "1803",
     "heading": "تفسير سورة الأعراف",
     "source": "toc"
    },
    "8": {
     "start": "1804",
     "end": "1899",
     "heading": "تفسير سورة الأنفال",
     "source": "toc"
    },
    "9": {
     "start": "1900",
     "end": "2043",
     "heading": "تفسير سورة التوبة",
     "source": "toc"
    },
    "10": {
     "start": "2044",
     "end": "2100",
     "heading": "تفسير سورة يونس",
     "source": "toc"
    },
    "11": {
     "start": "2101",
     "end": "2163",
     "heading": "تفسير سورة هود",
     "source": "toc"
    },
    "12": {
     "start": "2164",
     "end": "2226",
     "heading": "تفسير سورة يوسف",
     "source": "toc"
    },
    "13": {
     "start": "2227",
     "end": "2274",
     "heading": "تفسير سورة الرعد",
     "source": "toc"
    },
    "14": {
     "start": "2275",
     "end": "2322",
     "heading": "تفسير سورة إبراهيم ﵇",
     "source": "toc"
    },
    "15": {
     "start": "2323",
     "end": "2353",
     "heading": "تفسير سورة الحجر",
     "source": "toc"
    },
    "16": {
     "start": "2354",
     "end": "2415",
     "heading": "تفسير سورة النحل",
     "source": "toc"
    },
    "17": {
     "start": "2416",
     "end": "2542",
     "heading": "تفسير سورة الإسراء",
     "source": "toc"
    },
    "18": {
     "start": "2543",
     "end": "2619",
     "heading": "تفسير سورة الكهف",
     "source": "toc"
    },
    "19": {
     "start": "2620",
     "end": "2679",
     "heading": "تفسير سورة مريم [﵍]",
     "source": "toc"
    },
    "20": {
     "start": "2680",
     "end": "2739",
     "heading": "تفسير سورة طه",
     "source": "toc"
    },
    "21": {
     "start": "2740",
     "end": "2797",
     "heading": "سورة الأنبياء",
     "source": "toc"
    },
    "22": {
     "start": "2798",
     "end": "2866",
     "heading": "تفسير سورة الحج",
     "source": "toc"
    },
    "23": {
     "start": "2867",
     "end": "2910",
     "heading": "تفسير سورة المؤمنون",
     "source": "toc"
    },
    "24": {
     "start": "2911",
     "end": "2996",
     "heading": "سورة النور",
     "source": "toc"
    },
    "25": {
     "start": "2997",
     "end": "3039",
     "heading": "تفسير سورة الفرقان",
     "source": "toc"
    },
    "26": {
     "start": "3040",
     "end": "3082",
     "heading": "سورة الشعراء",
     "source": "page_heading"
    },
    "27": {
     "start": "3083",
     "end": "3124",
     "heading": "تفسير سورة النمل",
     "source": "toc"
    },
    "28": {
     "start": "3125",
     "end": "3167",
     "heading": "تفسير سورة القصص",
     "source": "toc"
    },
    "29": {
     "start": "3168",
     "end": "3201",
     "heading": "تفسير سورة العنكبوت",
     "source": "page_heading"
    },
    "30": {
     "start": "3202",
     "end": "3234",
     "heading": "تفسير سورة الروم",
     "source": "toc"
    },
    "31": {
     "start": "3235",
     "end": "3262",
     "heading": "تفسير سورة لقمان",
     "source": "toc"
    },
    "32": {
     "start": "3263",
     "end": "3279",
     "heading": "تفسير سورة السجدة",
     "source": "toc"
    },
    "33": {
     "start": "3280",
     "end": "3398",
     "heading": "تفسير سورة الأحزاب",
     "source": "toc"
    },
    "34": {
     "start": "3399",
     "end": "3436",
     "heading": "تفسير سورة سبأ",
     "source": "toc"
    },
    "35": {
     "start": "3437",
     "end": "3465",
     "heading": "تفسير سورة فاطر وهي مكية",
     "source": "toc"
    },
    "36": {
     "start": "3466",
     "end": "3502",
     "heading": "تفسير سورة يس",
     "source": "toc"
    },
    "37": {
     "start": "3503",
     "end": "3548",
     "heading": "تفسير سورة الصافات",
     "source": "toc"
    },
    "38": {
     "start": "3549",
     "end": "3581",
     "heading": "تفسير سورة ص",
     "source": "toc"
    },
    "39": {
     "start": "3582",
     "end": "3623",
     "heading": "تفسير سورة الزمر",
     "source": "toc"
    },
    "40": {
     "start": "3624",
     "end": "3658",
     "heading": "تفسير سورة غافر",
     "source": "toc"
    },
    "41": {
     "start": "3659",
     "end": "3686",
     "heading": "تفسير سورة فصلت",
     "source": "toc"
    },
    "42": {
     "start": "3687",
     "end": "3715",
     "heading": "تفسير سورة الشورى",
     "source": "toc"
    },
    "43": {
     "start": "3716",
     "end": "3742",
     "heading": "تفسير سورة الزخرف",
     "source": "toc"
    },
    "44": {
     "start": "3743",
     "end": "3761",
     "heading": "تفسير سورة الدخان",
     "source": "toc"
    },
    "45": {
     "start": "3762",
     "end": "3771",
     "heading": "تفسير سورة الجاثية",
     "source": "toc"
    },
    "46": {
     "start": "3772",
     "end": "3803",
     "heading": "تفسير سورة الأحقاف",
     "source": "toc"
    },
    "47": {
     "start": "3804",
     "end": "3822",
     "heading": "تفسير سورة القتال",
     "source": "toc"
    },
    "48": {
     "start": "3823",
     "end": "3861",
     "heading": "تفسير سورة الفتح",
     "source": "toc"
    },
    "49": {
     "start": "3862",
     "end": "3889",
     "heading": "تفسير سورة الحجرات",
     "source": "toc"
    },
    "50": {
     "start": "3890",
     "end": "3910",
     "heading": "تفسير سورة ق",
     "source": "toc"
    },
    "51": {
     "start": "3911",
     "end": "3924",
     "heading": "تفسير سورة الذاريات",
     "source": "toc"
    },
    "52": {
     "start": "3925",
     "end": "3939",
     "heading": "تفسير سورة الطور",
     "source": "toc"
    },
    "53": {
     "start": "3940",
     "end": "3967",
     "heading": "تفسير سورة النجم",
     "source": "toc"
    },
    "54": {
     "start": "3968",
     "end": "3985",
     "heading": "تفسير سورة القمر",
     "source": "toc"
    },
    "55": {
     "start": "3986",
     "end": "4009",
     "heading": "تفسير سورة الرحمن",
     "source": "toc"
    },
    "56": {
     "start": "4010",
     "end": "4050",
     "heading": "تفسير سورة الواقعة",
     "source": "toc"
    },
    "57": {
     "start": "4051",
     "end": "4079",
     "heading": "تفسير سورة الحديد",
     "source": "toc"
    },
    "58": {
     "start": "4080",
     "end": "4101",
     "heading": "تفسير سورة المجادلة",
     "source": "toc"
    },
    "59": {
     "start": "4102",
     "end": "4127",
     "heading": "تفسير سورة الحشر",
     "source": "toc"
    },
    "60": {
     "start": "4128",
     "end": "4149",
     "heading": "تفسير سورة الممتحنة",
     "source": "toc"
    },
    "61": {
     "start": "4150",
     "end": "4160",
     "heading": "تفسير سورة الصف",
     "source": "toc"
    },
    "62": {
     "start": "4161",
     "end": "4170",
     "heading": "تفسير سورة الجمعة",
     "source": "toc"
    },
    "63": {
     "start": "4171",
     "end": "4180",
     "heading": "تفسير سورة المنافقون",
     "source": "toc"
    },
    "64": {
     "start": "4181",
     "end": "4187",
     "heading": "تفسير سورة التغابن",
     "source": "toc"
    },
    "65": {
     "start": "4188",
     "end": "4203",
     "heading": "تفسير سورة الطلاق",
     "source": "toc"
    },
    "66": {
     "start": "4204",
     "end": "4219",
     "heading": "تفسير سورة التحريم",
     "source": "toc"
    },
    "67": {
     "start": "4220",
     "end": "4229",
     "heading": "تفسير سورة الملك",
     "source": "toc"
    },
    "68": {
     "start": "4230",
     "end": "4253",
     "heading": "تفسير سورة \"ن\"",
     "source": "toc"
    },
    "69": {
     "start": "4254",
     "end": "4265",
     "heading": "تفسير سورة الحاقة",
     "source": "toc"
    },
    "70": {
     "start": "4266",
     "end": "4276",
     "heading": "تفسير سورة سأل سائل",
     "source": "toc"
    },
    "71": {
     "start": "4277",
     "end": "4283",
     "heading": "تفسير سورة نوح",
     "source": "toc"
    },
    "72": {
     "start": "4284",
     "end": "4294",
     "heading": "تفسير سورة الجن",
     "source": "toc"
    },
    "73": {
     "start": "4295",
     "end": "4306",
     "heading": "تفسير سورة المزمل",
     "source": "toc"
    },
    "74": {
     "start": "4307",
     "end": "4320",
     "heading": "تفسير سورة المدثر",
     "source": "toc"
    },
    "75": {
     "start": "4321",
     "end": "4330",
     "heading": "تفسير سورة القيامة",
     "source": "toc"
    },
    "76": {
     "start": "4331",
     "end": "4341",
     "heading": "تفسير سورة الإنسان",
     "source": "toc"
    },
    "77": {
     "start": "4342",
     "end": "4347",
     "heading": "تفسير سورة المرسلات",
     "source": "toc"
    },
    "78": {
     "start": "4348",
     "end": "4357",
     "heading": "تفسير سورة النبأ",
     "source": "toc"
    },
    "79": {
     "start": "4358",
     "end": "4364",
     "heading": "تفسير سورة النازعات",
     "source": "toc"
    },
    "80": {
     "start": "4365",
     "end": "4373",
     "heading": "تفسير سورة عبس",
     "source": "toc"
    },
    "81": {
     "start": "4374",
     "end": "4386",
     "heading": "تفسير سورة التكوير",
     "source": "toc"
    },
    "82": {
     "start": "4387",
     "end": "4391",
     "heading": "تفسير سورة الانفطار",
     "source": "toc"
    },
    "83": {
     "start": "4392",
     "end": "4399",
     "heading": "تفسير سورة المطففين",
     "source": "toc"
    },
    "84": {
     "start": "4400",
     "end": "4407",
     "heading": "تفسير سورة الانشقاق",
     "source": "toc"
    },
    "85": {
     "start": "4408",
     "end": "4419",
     "heading": "تفسير سورة البروج",
     "source": "toc"
    },
    "86": {
     "start": "4420",
     "end": "4422",
     "heading": "تفسير سورة الطارق",
     "source": "toc"
    },
    "87": {
     "start": "4423",
     "end": "4429",
     "heading": "تفسير سورة سبح",
     "source": "toc"
    },
    "88": {
     "start": "4430",
     "end": "4435",
     "heading": "تفسير سورة الغاشية",
     "source": "toc"
    },
    "89": {
     "start": "4436",
     "end": "4447",
     "heading": "تفسير سورة الفجر",
     "source": "toc"
    },
    "90": {
     "start": "4448",
     "end": "4455",
     "heading": "تفسير سورة البلد",
     "source": "toc"
    },
    "91": {
     "start": "4456",
     "end": "4461",
     "heading": "تفسير سورة والشمس وضحاها",
     "source": "toc"
    },
    "92": {
     "start": "4462",
     "end": "4468",
     "heading": "تفسير سورة الليل",
     "source": "toc"
    },
    "93": {
     "start": "4469",
     "end": "4474",
     "heading": "تفسير سورة الضحى",
     "source": "toc"
    },
    "94": {
     "start": "4475",
     "end": "4479",
     "heading": "تفسير سورة ألم نشرح",
     "source": "toc"
    },
    "95": {
     "start": "4480",
     "end": "4481",
     "heading": "تفسير سورة والتين والزيتون",
     "source": "toc"
    },
    "96": {
     "start": "4482",
     "end": "4486",
     "heading": "تفسير سورة اقرأ",
     "source": "toc"
    },
    "97": {
     "start": "4487",
     "end": "4499",
     "heading": "تفسير سورة القدر",
     "source": "toc"
    },
    "98": {
     "start": "4500",
     "end": "4504",
     "heading": "تفسير سورة لم يكن",
     "source": "toc"
    },
    "99": {
     "start": "4505",
     "end": "4510",
     "heading": "تفسير سورة إذا زلزلت",
     "source": "toc"
    },
    "100": {
     "start": "4511",
     "end": "4513",
     "heading": "تفسير سورة العاديات",
     "source": "toc"
    },
    "101": {
     "start": "4514",
     "end": "4517",
     "heading": "تفسير سورة القارعة",
     "source": "toc"
    },
    "102": {
     "start": "4518",
     "end": "4524",
     "heading": "تفسير سورة التكاثر",
     "source": "toc"
    },
    "103": {
     "start": "4525",
     "end": "4526",
     "heading": "تفسير سورة العصر",
     "source": "toc"
    },
    "104": {
     "start": "4527",
     "end": "4528",
     "heading": "تفسير سورة ويل لكل همزة لمزة",
     "source": "toc"
    },
    "105": {
     "start": "4529",
     "end": "4536",
     "heading": "تفسير سورة الفيل",
     "source": "toc"
    },
    "106": {
     "start": "4537",
     "end": "4538",
     "heading": "تفسير سورة لإيلاف قريش",
     "source": "toc"
    },
    "107": {
     "start": "4539",
     "end": "4543",
     "heading": "تفسير السورة التي يذكر فيها الماعون",
     "source": "toc"
    },
    "108": {
     "start": "4544",
     "end": "4551",
     "heading": "تفسير سورة الكوثر",
     "source": "toc"
    },
    "109": {
     "start": "4552",
     "end": "4554",
     "heading": "تفسير سورة قل يا أيها الكافرون",
     "source": "toc"
    },
    "110": {
     "start": "4555",
     "end": "4559",
     "heading": "تفسير سورة إذا جاء نصر الله والفتح",
     "source": "toc"
    },
    "111": {
     "start": "4560",
     "end": "4563",
     "heading": "تفسير سورة تبت",
     "source": "toc"
    },
    "112": {
     "start": "4564",
     "end": "4575",
     "heading": "تفسير سورة الإخلاص",
     "source": "toc"
    },
    "113": {
     "start": "4576",
     "end": "4583",
     "heading": "تفسير سورتي المعوذتين",
     "source": "toc_shared_heading"
    },
    "114": {
     "start": "4584",
     "end": "4588",
     "heading": "سورة الناس",
     "source": "toc"
    }
   },
   "ayahs": {
    "1:1": "166",
    "1:2": "177",
    "2:254": "720",
    "2:255": "721",
    "26:1": "3040",
    "26:2": "3040",
    "26:3": "3040",
    "26:4": "3040",
    "26:5": "3040",
    "26:6": "3040",
    "26:7": "3040",
    "26:8": "3040",
    "26:9": "3040",
    "29:1": "3168",
    "29:2": "3168",
    "29:3": "3168",
    "29:4": "3168",
    "29:5": "3169",
    "29:6": "3169",
    "29:7": "3169",
    "29:8": "3169",
    "29:9": "3169",
    "68:1": "4230",
    "68:2": "4230",
    "68:3": "4230",
    "68:4": "4230",
    "68:5": "4230",
    "68:6": "4230",
    "68:7": "4230",
    "114:1": "4584",
    "114:2": "4584",
    "114:3": "4584"
   }
  },
  "20855": {
   "type": "tafsir",
   "key": "tafsir-al-qurtubi",
   "title": "تفسير القرطبي = الجامع لأحكام القرآن - ت البردوني وأطفيش (دار الكتب المصرية)",
   "last_page": "7453",
   "source": "surah ranges: live TOC of shamela.ws/book/20855 (2026-09-03; every surah has a TOC entry); ayahs: this edition marks each ayah with an editorial heading «[سورة X (n): آية m]» (no ﴿…﴾ brackets) — 2:1-229 seeded from the TOC sub-headings, 114:1-6 read live on pages 7449-7452. Run scripts/build-tafsir-index.mjs --tafsir 20855 to fill the rest.",
   "surahs": {
    "1": {
     "start": "114",
     "end": "157",
     "heading": "تفسير سورة الفاتحة",
     "source": "toc"
    },
    "2": {
     "start": "158",
     "end": "1343",
     "heading": "تفسير سورة البقرة",
     "source": "toc"
    },
    "3": {
     "start": "1344",
     "end": "1670",
     "heading": "سورة آل عمران",
     "source": "toc"
    },
    "4": {
     "start": "1671",
     "end": "2126",
     "heading": "تفسير سورة النساء",
     "source": "toc"
    },
    "5": {
     "start": "2127",
     "end": "2478",
     "heading": "تفسير سورة المائدة",
     "source": "toc"
    },
    "6": {
     "start": "2479",
     "end": "2696",
     "heading": "تفسير سورة الأنعام",
     "source": "toc"
    },
    "7": {
     "start": "2697",
     "end": "2896",
     "heading": "تفسير سورة الأعراف",
     "source": "toc"
    },
    "8": {
     "start": "2897",
     "end": "3002",
     "heading": "تفسير سورة الأنفال",
     "source": "toc"
    },
    "9": {
     "start": "3003",
     "end": "3245",
     "heading": "تفسير سورة براءة",
     "source": "toc"
    },
    "10": {
     "start": "3246",
     "end": "3331",
     "heading": "تفسير سورة يونس عليه السلام",
     "source": "toc"
    },
    "11": {
     "start": "3332",
     "end": "3448",
     "heading": "تفسير سورة هود عليه السلام",
     "source": "toc"
    },
    "12": {
     "start": "3449",
     "end": "3608",
     "heading": "سورة يوسف عليه السلام",
     "source": "toc"
    },
    "13": {
     "start": "3609",
     "end": "3668",
     "heading": "تفسير سورة الرعد",
     "source": "toc"
    },
    "14": {
     "start": "3669",
     "end": "3717",
     "heading": "تفسير سورة إبراهيم",
     "source": "toc"
    },
    "15": {
     "start": "3718",
     "end": "3781",
     "heading": "تفسير سورة الحجر",
     "source": "toc"
    },
    "16": {
     "start": "3782",
     "end": "3919",
     "heading": "تفسير سورة النحل",
     "source": "toc"
    },
    "17": {
     "start": "3920",
     "end": "4062",
     "heading": "تفسير سورة الإسراء",
     "source": "toc"
    },
    "18": {
     "start": "4063",
     "end": "4210",
     "heading": "تفسير سورة الكهف",
     "source": "toc"
    },
    "19": {
     "start": "4211",
     "end": "4301",
     "heading": "تفسير سورة مريم عليها السلام",
     "source": "toc"
    },
    "20": {
     "start": "4302",
     "end": "4404",
     "heading": "تفسير سورة طه عليه السلام",
     "source": "toc"
    },
    "21": {
     "start": "4405",
     "end": "4490",
     "heading": "سورة الأنبياء",
     "source": "toc"
    },
    "22": {
     "start": "4491",
     "end": "4591",
     "heading": "تفسير سورة الحج",
     "source": "toc"
    },
    "23": {
     "start": "4592",
     "end": "4647",
     "heading": "سورة المؤمنون",
     "source": "toc"
    },
    "24": {
     "start": "4648",
     "end": "4814",
     "heading": "سورة النور",
     "source": "toc"
    },
    "25": {
     "start": "4815",
     "end": "4900",
     "heading": "سورة الفرقان",
     "source": "toc"
    },
    "26": {
     "start": "4901",
     "end": "4967",
     "heading": "سورة الشعراء",
     "source": "toc"
    },
    "27": {
     "start": "4968",
     "end": "5060",
     "heading": "سورة النمل",
     "source": "toc"
    },
    "28": {
     "start": "5061",
     "end": "5136",
     "heading": "سورة القصص",
     "source": "toc"
    },
    "29": {
     "start": "5137",
     "end": "5179",
     "heading": "سورة العنكبوت",
     "source": "toc"
    },
    "30": {
     "start": "5180",
     "end": "5228",
     "heading": "تفسير سورة الروم",
     "source": "toc"
    },
    "31": {
     "start": "5229",
     "end": "5262",
     "heading": "تفسير سورة لقمان",
     "source": "toc"
    },
    "32": {
     "start": "5263",
     "end": "5291",
     "heading": "تفسير سورة السجدة",
     "source": "toc"
    },
    "33": {
     "start": "5292",
     "end": "5436",
     "heading": "سورة الأحزاب",
     "source": "toc"
    },
    "34": {
     "start": "5437",
     "end": "5496",
     "heading": "سورة سبإ",
     "source": "toc"
    },
    "35": {
     "start": "5497",
     "end": "5541",
     "heading": "سورة فاطر",
     "source": "toc"
    },
    "36": {
     "start": "5542",
     "end": "5601",
     "heading": "تفسير سورة يس",
     "source": "toc"
    },
    "37": {
     "start": "5602",
     "end": "5682",
     "heading": "تفسير سورة الصافات",
     "source": "toc"
    },
    "38": {
     "start": "5683",
     "end": "5772",
     "heading": "تفسير سورة ص",
     "source": "toc"
    },
    "39": {
     "start": "5773",
     "end": "5828",
     "heading": "تفسير سورة الزمر",
     "source": "toc"
    },
    "40": {
     "start": "5829",
     "end": "5877",
     "heading": "تفسير سورة غافر",
     "source": "toc"
    },
    "41": {
     "start": "5878",
     "end": "5917",
     "heading": "تفسير سورة فصلت",
     "source": "toc"
    },
    "42": {
     "start": "5918",
     "end": "5977",
     "heading": "تفسير سورة الشورى",
     "source": "toc"
    },
    "43": {
     "start": "5978",
     "end": "6041",
     "heading": "تفسير سورة الزخرف",
     "source": "toc"
    },
    "44": {
     "start": "6042",
     "end": "6072",
     "heading": "تفسير سورة الدخان",
     "source": "toc"
    },
    "45": {
     "start": "6073",
     "end": "6094",
     "heading": "تفسير سورة الجاثية -",
     "source": "toc"
    },
    "46": {
     "start": "6095",
     "end": "6139",
     "heading": "تفسير سورة الأحقاف",
     "source": "toc"
    },
    "47": {
     "start": "6140",
     "end": "6175",
     "heading": "تفسير سورة محمد",
     "source": "toc"
    },
    "48": {
     "start": "6176",
     "end": "6216",
     "heading": "تفسير سورة الفتح",
     "source": "toc"
    },
    "49": {
     "start": "6217",
     "end": "6267",
     "heading": "تفسير سورة الحجرات",
     "source": "toc"
    },
    "50": {
     "start": "6268",
     "end": "6295",
     "heading": "تفسير سورة ق -",
     "source": "toc"
    },
    "51": {
     "start": "6296",
     "end": "6324",
     "heading": "تفسير سورة و - الذاريات",
     "source": "toc"
    },
    "52": {
     "start": "6325",
     "end": "6347",
     "heading": "تفسير سورة والطور",
     "source": "toc"
    },
    "53": {
     "start": "6348",
     "end": "6391",
     "heading": "تفسير سورة والنجم",
     "source": "toc"
    },
    "54": {
     "start": "6392",
     "end": "6417",
     "heading": "تفسير سورة القمر",
     "source": "toc"
    },
    "55": {
     "start": "6418",
     "end": "6460",
     "heading": "تفسير سورة الرحمن",
     "source": "toc"
    },
    "56": {
     "start": "6461",
     "end": "6501",
     "heading": "تفسير سورة الواقعة",
     "source": "toc"
    },
    "57": {
     "start": "6502",
     "end": "6535",
     "heading": "تفسير سورة الحديد",
     "source": "toc"
    },
    "58": {
     "start": "6536",
     "end": "6576",
     "heading": "تفسير سورة المجادلة",
     "source": "toc"
    },
    "59": {
     "start": "6577",
     "end": "6624",
     "heading": "تفسير سورة الحشر",
     "source": "toc"
    },
    "60": {
     "start": "6625",
     "end": "6652",
     "heading": "تفسير سورة الممتحنة",
     "source": "toc"
    },
    "61": {
     "start": "6653",
     "end": "6666",
     "heading": "تفسير سورة الصف",
     "source": "toc"
    },
    "62": {
     "start": "6667",
     "end": "6695",
     "heading": "تفسير سورة الجمعة",
     "source": "toc"
    },
    "63": {
     "start": "6696",
     "end": "6706",
     "heading": "تفسير سورة المنافقين",
     "source": "toc"
    },
    "64": {
     "start": "6707",
     "end": "6722",
     "heading": "تفسير سورة التغابن",
     "source": "toc"
    },
    "65": {
     "start": "6723",
     "end": "6752",
     "heading": "تفسير سورة الطلاق",
     "source": "toc"
    },
    "66": {
     "start": "6753",
     "end": "6780",
     "heading": "تفسير سورة التحريم",
     "source": "toc"
    },
    "67": {
     "start": "6781",
     "end": "6797",
     "heading": "تفسير سورة الملك",
     "source": "toc"
    },
    "68": {
     "start": "6798",
     "end": "6831",
     "heading": "تفسير سورة ن والقلم",
     "source": "toc"
    },
    "69": {
     "start": "6832",
     "end": "6853",
     "heading": "تفسير سورة الحاقة",
     "source": "toc"
    },
    "70": {
     "start": "6854",
     "end": "6873",
     "heading": "تفسير سورة المعارج",
     "source": "toc"
    },
    "71": {
     "start": "6874",
     "end": "6890",
     "heading": "تفسير سورة نوح",
     "source": "toc"
    },
    "72": {
     "start": "6891",
     "end": "6920",
     "heading": "تفسير سورة الجن",
     "source": "toc"
    },
    "73": {
     "start": "6921",
     "end": "6948",
     "heading": "تفسير سورة المزمل",
     "source": "toc"
    },
    "74": {
     "start": "6949",
     "end": "6980",
     "heading": "تفسير سورة المدثر",
     "source": "toc"
    },
    "75": {
     "start": "6981",
     "end": "7007",
     "heading": "تفسير سورة القيامة",
     "source": "toc"
    },
    "76": {
     "start": "7008",
     "end": "7042",
     "heading": "تفسير سورة الإنسان",
     "source": "toc"
    },
    "77": {
     "start": "7043",
     "end": "7058",
     "heading": "تفسير سورة المرسلات",
     "source": "toc"
    },
    "78": {
     "start": "7059",
     "end": "7079",
     "heading": "تفسير سورة عم و - تسمى سورة النبأ",
     "source": "toc"
    },
    "79": {
     "start": "7080",
     "end": "7100",
     "heading": "تفسير سورة النازعات",
     "source": "toc"
    },
    "80": {
     "start": "7101",
     "end": "7115",
     "heading": "تفسير سورة عبس",
     "source": "toc"
    },
    "81": {
     "start": "7116",
     "end": "7133",
     "heading": "تفسير سورة التكوير",
     "source": "toc"
    },
    "82": {
     "start": "7134",
     "end": "7139",
     "heading": "تفسير سورة الانفطار",
     "source": "toc"
    },
    "83": {
     "start": "7140",
     "end": "7158",
     "heading": "تفسير سورة المطففين",
     "source": "toc"
    },
    "84": {
     "start": "7159",
     "end": "7172",
     "heading": "تفسير سورة الانشقاق",
     "source": "toc"
    },
    "85": {
     "start": "7173",
     "end": "7189",
     "heading": "تفسير سورة البروج",
     "source": "toc"
    },
    "86": {
     "start": "7190",
     "end": "7201",
     "heading": "تفسير سورة الطارق",
     "source": "toc"
    },
    "87": {
     "start": "7202",
     "end": "7213",
     "heading": "تفسير سورة الأعلى",
     "source": "toc"
    },
    "88": {
     "start": "7214",
     "end": "7226",
     "heading": "تفسير سورة الغاشية",
     "source": "toc"
    },
    "89": {
     "start": "7227",
     "end": "7247",
     "heading": "تفسير سورة الفجر",
     "source": "toc"
    },
    "90": {
     "start": "7248",
     "end": "7260",
     "heading": "تفسير سورة البلد",
     "source": "toc"
    },
    "91": {
     "start": "7261",
     "end": "7268",
     "heading": "تفسير سورة الشمس",
     "source": "toc"
    },
    "92": {
     "start": "7269",
     "end": "7279",
     "heading": "تفسير سورة والليل",
     "source": "toc"
    },
    "93": {
     "start": "7280",
     "end": "7292",
     "heading": "تفسير سورة الضحى",
     "source": "toc"
    },
    "94": {
     "start": "7293",
     "end": "7298",
     "heading": "تفسير سورة ألم نشرح",
     "source": "toc"
    },
    "95": {
     "start": "7299",
     "end": "7305",
     "heading": "تفسير سورة التين",
     "source": "toc"
    },
    "96": {
     "start": "7306",
     "end": "7317",
     "heading": "تفسير سورة العلق",
     "source": "toc"
    },
    "97": {
     "start": "7318",
     "end": "7326",
     "heading": "تفسير سورة القدر",
     "source": "toc"
    },
    "98": {
     "start": "7327",
     "end": "7334",
     "heading": "تفسير سورة البينة",
     "source": "toc"
    },
    "99": {
     "start": "7335",
     "end": "7341",
     "heading": "تفسير سورة الزلزلة",
     "source": "toc"
    },
    "100": {
     "start": "7342",
     "end": "7352",
     "heading": "تفسير سورة والعاديات",
     "source": "toc"
    },
    "101": {
     "start": "7353",
     "end": "7356",
     "heading": "تفسير سورة القارعة",
     "source": "toc"
    },
    "102": {
     "start": "7357",
     "end": "7366",
     "heading": "تفسير سورة التكاثر",
     "source": "toc"
    },
    "103": {
     "start": "7367",
     "end": "7369",
     "heading": "تفسير سورة والعصر",
     "source": "toc"
    },
    "104": {
     "start": "7370",
     "end": "7375",
     "heading": "تفسير سورة الهمزة",
     "source": "toc"
    },
    "105": {
     "start": "7376",
     "end": "7388",
     "heading": "تفسير سورة الفيل",
     "source": "toc"
    },
    "106": {
     "start": "7389",
     "end": "7398",
     "heading": "تفسير سورة قريش",
     "source": "toc"
    },
    "107": {
     "start": "7399",
     "end": "7404",
     "heading": "تفسير سورة الماعون",
     "source": "toc"
    },
    "108": {
     "start": "7405",
     "end": "7412",
     "heading": "تفسير سورة الكوثر",
     "source": "toc"
    },
    "109": {
     "start": "7413",
     "end": "7417",
     "heading": "تفسير سورة الكافرون",
     "source": "toc"
    },
    "110": {
     "start": "7418",
     "end": "7422",
     "heading": "تفسير سورة النصر",
     "source": "toc"
    },
    "111": {
     "start": "7423",
     "end": "7432",
     "heading": "تفسير سورة تبت",
     "source": "toc"
    },
    "112": {
     "start": "7433",
     "end": "7439",
     "heading": "تفسير سورة الإخلاص",
     "source": "toc"
    },
    "113": {
     "start": "7440",
     "end": "7448",
     "heading": "تفسير سورة الفلق",
     "source": "toc"
    },
    "114": {
     "start": "7449",
     "end": "7453",
     "heading": "تفسير سورة الناس",
     "source": "toc"
    }
   },
   "ayahs": {
    "2:1": "160",
    "2:2": "160",
    "2:3": "168",
    "2:4": "186",
    "2:5": "187",
    "2:6": "189",
    "2:7": "191",
    "2:8": "198",
    "2:9": "201",
    "2:10": "203",
    "2:11": "206",
    "2:12": "210",
    "2:13": "211",
    "2:14": "212",
    "2:15": "213",
    "2:16": "216",
    "2:17": "217",
    "2:18": "219",
    "2:19": "221",
    "2:20": "227",
    "2:21": "231",
    "2:22": "233",
    "2:23": "237",
    "2:24": "239",
    "2:25": "243",
    "2:26": "247",
    "2:27": "252",
    "2:28": "254",
    "2:29": "256",
    "2:30": "267",
    "2:31": "285",
    "2:32": "291",
    "2:33": "294",
    "2:34": "297",
    "2:35": "304",
    "2:36": "317",
    "2:37": "329",
    "2:38": "333",
    "2:39": "335",
    "2:40": "336",
    "2:41": "339",
    "2:42": "346",
    "2:43": "348",
    "2:44": "370",
    "2:45": "377",
    "2:46": "381",
    "2:47": "382",
    "2:48": "382",
    "2:49": "387",
    "2:50": "393",
    "2:51": "399",
    "2:52": "403",
    "2:53": "405",
    "2:54": "406",
    "2:55": "409",
    "2:56": "409",
    "2:57": "411",
    "2:58": "415",
    "2:59": "421",
    "2:60": "423",
    "2:61": "428",
    "2:62": "438",
    "2:63": "438",
    "2:64": "438",
    "2:65": "438",
    "2:66": "449",
    "2:67": "450",
    "2:68": "454",
    "2:69": "456",
    "2:70": "457",
    "2:71": "458",
    "2:72": "461",
    "2:73": "463",
    "2:74": "468",
    "2:75": "473",
    "2:76": "475",
    "2:77": "475",
    "2:78": "477",
    "2:79": "479",
    "2:80": "482",
    "2:81": "483",
    "2:82": "483",
    "2:83": "484",
    "2:84": "490",
    "2:85": "491",
    "2:86": "491",
    "2:87": "495",
    "2:88": "497",
    "2:89": "498",
    "2:90": "499",
    "2:91": "501",
    "2:92": "502",
    "2:93": "503",
    "2:94": "504",
    "2:95": "504",
    "2:96": "506",
    "2:97": "508",
    "2:98": "508",
    "2:99": "511",
    "2:100": "511",
    "2:101": "512",
    "2:102": "513",
    "2:103": "528",
    "2:104": "529",
    "2:105": "533",
    "2:106": "533",
    "2:107": "541",
    "2:108": "541",
    "2:109": "542",
    "2:110": "542",
    "2:111": "546",
    "2:112": "546",
    "2:113": "547",
    "2:114": "548",
    "2:115": "551",
    "2:116": "556",
    "2:117": "558",
    "2:118": "563",
    "2:119": "564",
    "2:120": "565",
    "2:121": "567",
    "2:122": "567",
    "2:123": "567",
    "2:124": "568",
    "2:125": "582",
    "2:126": "589",
    "2:127": "592",
    "2:128": "598",
    "2:129": "602",
    "2:130": "604",
    "2:131": "606",
    "2:132": "606",
    "2:133": "609",
    "2:134": "610",
    "2:135": "611",
    "2:136": "612",
    "2:137": "614",
    "2:138": "616",
    "2:139": "617",
    "2:140": "618",
    "2:141": "619",
    "2:142": "619",
    "2:143": "625",
    "2:144": "630",
    "2:145": "633",
    "2:146": "634",
    "2:147": "635",
    "2:148": "636",
    "2:149": "639",
    "2:150": "639",
    "2:151": "642",
    "2:152": "643",
    "2:153": "643",
    "2:154": "644",
    "2:155": "645",
    "2:156": "647",
    "2:157": "647",
    "2:158": "649",
    "2:159": "656",
    "2:160": "659",
    "2:161": "660",
    "2:162": "660",
    "2:163": "662",
    "2:164": "663",
    "2:165": "675",
    "2:166": "677",
    "2:167": "678",
    "2:168": "679",
    "2:169": "681",
    "2:170": "682",
    "2:171": "686",
    "2:172": "687",
    "2:173": "688",
    "2:174": "706",
    "2:175": "708",
    "2:176": "708",
    "2:177": "709",
    "2:178": "716",
    "2:179": "728",
    "2:180": "729",
    "2:181": "740",
    "2:182": "741",
    "2:183": "744",
    "2:184": "744",
    "2:185": "762",
    "2:186": "780",
    "2:187": "786",
    "2:188": "809",
    "2:189": "813",
    "2:190": "819",
    "2:191": "822",
    "2:192": "822",
    "2:193": "825",
    "2:194": "826",
    "2:195": "833",
    "2:196": "837",
    "2:197": "876",
    "2:198": "885",
    "2:199": "899",
    "2:200": "903",
    "2:201": "904",
    "2:202": "906",
    "2:203": "909",
    "2:204": "922",
    "2:205": "924",
    "2:206": "926",
    "2:207": "928",
    "2:208": "930",
    "2:209": "932",
    "2:210": "933",
    "2:211": "935",
    "2:212": "936",
    "2:213": "938",
    "2:214": "941",
    "2:215": "944",
    "2:216": "945",
    "2:217": "948",
    "2:218": "948",
    "2:219": "959",
    "2:220": "970",
    "2:221": "974",
    "2:222": "988",
    "2:223": "999",
    "2:224": "1004",
    "2:225": "1007",
    "2:226": "1010",
    "2:227": "1010",
    "2:228": "1020",
    "2:229": "1033",
    "114:1": "7449",
    "114:2": "7449",
    "114:3": "7449",
    "114:4": "7450",
    "114:5": "7452",
    "114:6": "7452"
   }
  }
 }
};
