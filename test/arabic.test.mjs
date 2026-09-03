import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, absolute, links, booksFromHtml, normalizeArabic, titleScore } from "../src/lib/arabic.mjs";

test("clean strips tags and decodes entities", () => {
  assert.equal(clean("<b>كتاب</b> &amp; سُنّة &#160;&nbsp;"), "كتاب & سُنّة");
  assert.equal(clean("<div>  a  <span>b</span>  </div>"), "a b");
});

test("absolute resolves relative hrefs", () => {
  assert.equal(absolute("/book/1"), "https://shamela.ws/book/1");
  assert.equal(absolute("book/1"), "https://shamela.ws/book/1");
  assert.equal(absolute("https://x.test/y"), "https://x.test/y");
});

test("links extracts matching anchors", () => {
  const html = `<a class="cat_title" href="/category/5">1. الحديث 1245</a><a class="other" href="/x">no</a>`;
  const out = links(html, "cat_title", /\/category\/(\d+)/);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "1. الحديث 1245");
});

test("booksFromHtml extracts book + nearby author", () => {
  const html = `
    <a class="book_title" href="/book/123">صحيح البخاري</a>
    <span>تحقيق</span>
    <a href="/author/456">محمد بن إسماعيل البخاري</a>
    <a class="book_title" href="/book/123">صحيح البخاري (تكرار)</a>
  `;
  const books = booksFromHtml(html);
  assert.equal(books.length, 1, "dedupe by book_id");
  assert.equal(books[0].book_id, "123");
  assert.equal(books[0].title, "صحيح البخاري");
  assert.equal(books[0].author, "محمد بن إسماعيل البخاري");
  assert.equal(books[0].author_id, "456");
});

test("normalizeArabic folds hamza, alef-maqsura, ta-marbuta, harakat", () => {
  assert.equal(normalizeArabic("أبو عبدِ الله"), normalizeArabic("ابو عبد الله"));
  assert.equal(normalizeArabic("الهدى"), normalizeArabic("الهدي"));
  assert.equal(normalizeArabic("سنة"), normalizeArabic("سنّة"));
});

test("titleScore ranks exact > prefix > contains > word match", () => {
  assert.ok(titleScore("البخاري", "البخاري") >= titleScore("صحيح البخاري", "البخاري"));
  assert.ok(titleScore("صحيح البخاري", "البخاري") > titleScore("فتح الباري", "البخاري"));
});

test("titleScore penalizes commentaries when query is the base text", () => {
  const base = titleScore("صحيح البخاري", "البخاري");
  const sharh = titleScore("شرح صحيح البخاري", "البخاري");
  assert.ok(base > sharh, `base=${base} should exceed sharh=${sharh}`);
});
