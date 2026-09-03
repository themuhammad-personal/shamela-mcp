import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../src/lib/shamela.mjs";

// A fake `text()` that serves fixture HTML per URL — fully offline.
// POST requests are matched by URL alone (their bodies are deterministic
// query strings we don't need to assert against here).
function fakeText(fixtures) {
  return async (url, init = {}) => {
    if (url in fixtures) return fixtures[url];
    throw new Error(`no fixture for ${init.method === "POST" ? "POST " : ""}${url}`);
  };
}

const HOME = `<a class="cat_title" href="/category/5">1. الحديث 1245</a>`;
const BOOK_DETAILS = `
  <h1 class="size-20"><a>صحيح البخاري</a></h1>
  <a href="/author/456">محمد بن إسماعيل البخاري</a>
  <a href="/category/5">الحديث</a>
  <a href="/book/123/1">باب بدء الوحي</a>
  <a href="/book/123/2">باب الإيمان</a>
  <div style="line-height: 1.8;">
    الناشر: دار طوق النجاة
    المحقق: محمد فؤاد عبد الباقي
    الطبعة: الأولى
    عدد الصفحات: 4500
  </div>
`;
const PAGE = `<div class="nass">حدثنا الحميدي ... فبينا نحن عنده</div><div class="next">`;

test("categories parses home listing", async () => {
  const c = createClient({ text: fakeText({ "https://shamela.ws/": HOME }) });
  const cats = await c.categories();
  assert.equal(cats.length, 1);
  assert.equal(cats[0].id, "5");
  assert.equal(cats[0].name, "الحديث");
  assert.equal(cats[0].book_count, 1245);
});

test("details extracts title/author/metadata/toc + muhaqqiq", async () => {
  const c = createClient({
    text: fakeText({ "https://shamela.ws/book/123": BOOK_DETAILS }),
  });
  const d = await c.details("123");
  assert.equal(d.title, "صحيح البخاري");
  assert.equal(d.author, "محمد بن إسماعيل البخاري");
  assert.equal(d.metadata.muhaqqiq, "محمد فؤاد عبد الباقي");
  assert.equal(d.metadata.publisher, "دار طوق النجاة");
  assert.equal(d.metadata.edition, "الأولى");
  assert.equal(d.metadata.page_count, "4500");
  assert.equal(d.toc.length, 2);
});

test("bookPage returns content + title/author", async () => {
  const c = createClient({
    text: fakeText({
      "https://shamela.ws/book/123/1": PAGE,
      "https://shamela.ws/book/123": BOOK_DETAILS,
    }),
  });
  const p = await c.bookPage("123", "1");
  assert.ok(p.content.includes("حدثنا"));
  assert.equal(p.book_title, "صحيح البخاري");
  assert.equal(p.page_number, "1");
});

test("bookPage reuses cached details — one details fetch per book, not per page", async () => {
  // bookPage() needs title/author from the details page. Uncached, every page
  // read costs two upstream requests; the index builder reads hundreds of
  // pages, so that doubling is real load on shamela.ws (Roadmap 0.4).
  let detailCalls = 0;
  const text = async (url) => {
    if (url === "https://shamela.ws/book/123") {
      detailCalls += 1;
      return BOOK_DETAILS;
    }
    if (url.startsWith("https://shamela.ws/book/123/")) return PAGE;
    throw new Error(`no fixture for ${url}`);
  };
  const c = createClient({ text });
  await c.bookPage("123", "1");
  await c.bookPage("123", "2");
  await c.bookPage("123", "3");
  assert.equal(detailCalls, 1, "details fetched once for three page reads");
});

test("titleSearch parses JSON and ranks", async () => {
  const c = createClient({
    text: fakeText({
      "https://shamela.ws/ajax/book/?term=%D8%A7%D9%84%D8%A8%D8%AE%D8%A7%D8%B1%D9%8A":
        JSON.stringify({ results: { items: [{ id: "123", text: "صحيح البخاري" }] } }),
    }),
  });
  const r = await c.titleSearch("البخاري", 1, 10);
  assert.equal(r.total_available, 1);
  assert.equal(r.results[0].book_id, "123");
  // title "صحيح البخاري" contains but does not start with "البخاري"
  assert.equal(r.results[0].match, "partial_normalized");
});

test("searchLibrary parses result HTML and applies exclude post-filter", async () => {
  const html = `<div>
    <a href="/book/123/5" class="x"><b>كتاب الإيمان</b> <span>[البخاري]</span> tail
    <p class="srch-snippet">حدثنا فلان عن فلان مرفوعا</p></a>
  </div>`;
  const c = createClient({
    text: fakeText({ "https://shamela.ws/ajax/search": html }),
  });
  const r = await c.searchLibrary("إيمان", "any_words", [], [], [], 1);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].book_id, "123");
  assert.equal(r.results[0].page_id, "5");
  assert.equal(r.results[0].author, "البخاري");

  // exclude a word present in the snippet → filtered out
  const r2 = await c.searchLibrary("إيمان", "any_words", ["فلان"], [], [], 1);
  assert.equal(r2.results.length, 0);
});

test("authorBooks returns name + books", async () => {
  const authorHtml = `<h1>محمد بن إسماعيل البخاري</h1>
    <a class="book_title" href="/book/123">صحيح البخاري</a>`;
  const c = createClient({ text: fakeText({ "https://shamela.ws/author/456": authorHtml }) });
  const a = await c.authorBooks("456");
  assert.equal(a.author, "محمد بن إسماعيل البخاري");
  assert.equal(a.books[0].book_id, "123");
});
