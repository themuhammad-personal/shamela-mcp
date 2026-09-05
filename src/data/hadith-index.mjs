/**
 * Verified static hadith index (Roadmap Phase 2).
 *
 * Generated/updated by scripts/build-hadith-index.mjs from shamela.ws
 * /ajax/specialnumber2id and verified against on-page paragraph-start markers.
 *
 * Schema:
 *   books: {
 *     "<book_id>": {
 *       type: "hadith",
 *       key?: string,
 *       coverage: "complete" | "partial",
 *       index:   { "<hadith_number>": { page: "<node_id>", verified: boolean, note?: string } },
 *       reverse: { "<node_id>": ["<hadith_number>", ...] }
 *     }
 *   }
 */
export default {
  "generated_at": "2026-09-05T00:00:00.000Z",
  "books": {
    "1681": {
      "type": "hadith",
      "key": "sahih-al-bukhari",
      "coverage": "partial",
      "index": {
        "1": { "page": "1", "verified": true },
        "8": { "page": "19", "verified": true },
        "7563": { "page": "11208", "verified": true }
      },
      "reverse": {
        "1": ["1"],
        "19": ["8"],
        "11208": ["7563"]
      }
    },
    "1727": {
      "type": "hadith",
      "key": "sahih-muslim",
      "coverage": "partial",
      "index": {
        "8": { "page": "62", "verified": true },
        "3033": { "page": "7494", "verified": true }
      },
      "reverse": {
        "62": ["8"],
        "7494": ["3033"]
      }
    },
    "1726": {
      "type": "hadith",
      "key": "sunan-abi-dawud",
      "coverage": "partial",
      "index": {
        "1": { "page": "3", "verified": true }
      },
      "reverse": {
        "3": ["1"]
      }
    },
    "1435": {
      "type": "hadith",
      "key": "jami-at-tirmidhi",
      "coverage": "partial",
      "index": {
        "1": { "page": "3", "verified": true }
      },
      "reverse": {
        "3": ["1"]
      }
    },
    "829": {
      "type": "hadith",
      "key": "sunan-an-nasai",
      "coverage": "partial",
      "index": {
        "1": { "page": "7", "verified": true }
      },
      "reverse": {
        "7": ["1"]
      }
    },
    "1198": {
      "type": "hadith",
      "key": "sunan-ibn-majah",
      "coverage": "partial",
      "index": {
        "1": { "page": "4", "verified": true }
      },
      "reverse": {
        "4": ["1"]
      }
    },
    "25794": {
      "type": "hadith",
      "key": "musnad-ahmad",
      "coverage": "partial",
      "index": {
        "1": { "page": "153", "verified": true }
      },
      "reverse": {
        "153": ["1"]
      }
    }
  }
};
