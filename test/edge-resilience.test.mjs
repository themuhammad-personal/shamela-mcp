import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/tools.mjs";

function mockClient(overrides = {}) {
  return {
    categories: async () => [],
    booksByCategory: async () => ({ category: {}, books: [], page: 1, total_pages: 1 }),
    details: async (id) => {
      if (overrides.details) return overrides.details(id);
      throw new Error("HTTP 404");
    },
    bookPage: async (id, page) => {
      if (overrides.bookPage) return overrides.bookPage(id, page);
      throw new Error("HTTP 404");
    },
    search: async () => ({ results: [], page: 1, total_pages: 1 }),
    recent: async () => [],
    allBooks: async () => [],
    hadithPageId: async (id, num) => {
      if (overrides.hadithPageId) return overrides.hadithPageId(id, num);
      return null;
    },
  };
}

test("get_book_details: provides verified metadata fallback when upstream returns 403 on canonical book", async () => {
  const srv = createServer(
    mockClient({
      details: async () => {
        const err = new Error("HTTP 403 Forbidden");
        err.status = 403;
        throw err;
      },
      bookPage: async (id, page) => {
        return {
          book_id: id,
          book_title: "صحيح البخاري",
          author: "البخاري",
          page_number: String(page),
          volume: "1",
          nav: { last: "11208" },
          paragraphs: ["١ - حدثنا الحميدي"],
        };
      },
    }),
  );

  const res = await srv._registeredTools.get_book_details.handler({ book_id: "1681" });
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.metadata_fallback, true);
  assert.equal(data.book_id, "1681");
  assert.equal(data.canonical_edition.confidence, "verified");
  assert.equal(data.is_canonical_numbering, true);
});

test("get_book_details: does not use fallback for non-canonical book when 403 is received", async () => {
  const srv = createServer(
    mockClient({
      details: async () => {
        const err = new Error("HTTP 403 Forbidden");
        err.status = 403;
        throw err;
      },
    }),
  );

  const res = await srv._registeredTools.get_book_details.handler({ book_id: "999999" });
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.error, "upstream_http");
  assert.equal(data.status, 403);
  assert.deepEqual(data.verification, { status: "upstream_blocked", evidence: "http_403" });
});

test("get_hadith_by_number: static index fallback crosses page boundaries when hadith spans pages", async () => {
  const srv = createServer(
    mockClient({
      // Live lookup disabled to force static path
      hadithPageId: async () => null,
      bookPage: async (id, page) => {
        if (String(page) === "19") {
          return {
            book_id: id,
            page_number: "19",
            paragraphs: [
              "٨ - حَدَّثَنَا عُبَيْدُ اللهِ بْنُ مُوسَى",
              "قَالَ: أَخْبَرَنَا حَنْظَلَةُ بْنُ أَبِي سُفْيَانَ، عَنْ عِكْرِمَةَ بْنِ خَالِدٍ، عَنِ ابْنِ عُمَرَ",
            ],
            nav: { next: "20" },
          };
        }
        if (String(page) === "20") {
          return {
            book_id: id,
            page_number: "20",
            paragraphs: [
              "قَالَ: قَالَ رَسُولُ اللهِ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ: «بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ»",
              "٩ - حَدَّثَنَا عَبْدُ اللهِ بْنُ مُحَمَّدٍ",
            ],
            nav: { next: "21" },
          };
        }
        throw new Error("unexpected page");
      },
    }),
  );

  const res = await srv._registeredTools.get_hadith_by_number.handler({ book_id: "1681", hadith_number: 8 });
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.found, true);
  assert.equal(data.hadith_number, "8");
  assert.deepEqual(data.spans_pages, ["19", "20"]);
  assert.equal(data.continuation_complete, true);
  assert.match(data.matn, /بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ/);
  assert.doesNotMatch(data.matn, /٩ - حَدَّثَنَا/);
});
