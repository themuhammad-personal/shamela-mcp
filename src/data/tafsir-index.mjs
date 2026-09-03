/**
 * Persisted tafsir index: surah → shamela page range, and surah:ayah → the
 * first page whose Qur'anic bracket «﴿…(n)…﴾» carries that ayah number.
 *
 * GENERATED / MERGED by scripts/build-tafsir-index.mjs — do not hand-edit
 * entries. The tool layer never walks a book at request time: it answers
 * from `ayahs` in O(1), or bisects inside the surah's `surahs[n]` range
 * (≤ ~15 page fetches) and never leaves that range.
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
  }
 }
};
