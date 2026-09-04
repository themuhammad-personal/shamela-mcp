import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBookPage } from "../src/lib/page.mjs";
import { detectHadithNumbers } from "../src/lib/citation-detect.mjs";

// A real, unmodified shamela.ws page (book 9904, page 629). This is the DOM
// every selector in src/lib/page.mjs was written against.
const REAL = readFileSync(new URL("./fixtures/shamela-book-9904-page.html", import.meta.url), "utf8");

test("real page: ids, volume, printed page, chapter path, nav", () => {
  const p = parseBookPage(REAL);
  assert.equal(p.book_id, "9904");
  assert.equal(p.page_id, "629");
  assert.equal(p.volume, "2");
  assert.equal(p.printed_page, "244");
  assert.deepEqual(p.chapter_path, [
    { title: "المجلد الثاني", page: "392" },
    { title: "الحال", page: "627" },
  ]);
  assert.equal(p.chapter, "الحال");
  assert.deepEqual(p.nav, { prev: "628", next: "630", last: "1329" });
  assert.equal(p.title_tag, "ص244 - كتاب شرح ابن عقيل على ألفية ابن مالك - الحال - المكتبة الشاملة");
  assert.equal(p.hadith_number_hint, null, "non-hadith book has no #fld_specialNum_top");
});

test("real page: main paragraphs separated from footnotes (p.hamesh), copy buttons dropped", () => {
  const p = parseBookPage(REAL);
  assert.equal(p.paragraphs.length, 6);
  assert.ok(p.paragraphs[0].startsWith("وكونه منتقلا مشتقا"));
  assert.ok(!p.content.includes("fa-copy"));
  assert.ok(!p.content.includes("الواو للاستئناف"), "footnote text must not leak into content");
  assert.equal(p.footnotes.length, 1);
  assert.ok(p.footnotes[0].startsWith("(١)"));
  assert.ok(p.footnotes[0].split("\n").length >= 2, "<br> separated footnotes keep line breaks");
});

test("real page: a poetry line number «١٧٩ -» is the only paragraph-start number", () => {
  // This shows why hadith detection must be gated by book type/whitelist, not
  // by regex alone: a grammar book has numbered شواهد in the same layout.
  assert.deepEqual(detectHadithNumbers(parseBookPage(REAL).paragraphs), ["179"]);
});

test("hadith page markup (synthetic, same DOM): specialNum input + Muslim-style markers", () => {
  const html = `
    <html><head><title>ج1 - ص36 - كتاب صحيح مسلم ت عبد الباقي - باب بيان الإيمان - المكتبة الشاملة</title></head><body>
    <a href="https://shamela.ws/book/1727/61#p1" class="btn btn-3d btn-white btn-sm">&nbsp;&lt;&nbsp;</a>
    <input type="hidden" id="fld_part_top" value="1" />
    ص: <input type="number" class="text-center" size="2" id="fld_goto_top" value="36" />
    <a href="https://shamela.ws/book/1727/63#p1" class="btn btn-3d btn-white btn-sm">&nbsp;&gt;&nbsp;</a>
    <a href="https://shamela.ws/book/1727/7495#p1" class="btn btn-3d btn-white btn-sm">&gt;&gt;</a>
    <input type="text" id="fld_specialNum_top" value="8" />
    <div class="size-12">
      <a href="https://shamela.ws/book/1727"><span class="text-black">فهرس الكتاب</span></a>
      <a href="https://shamela.ws/book/1727/60"><span class="text-black">١ - كتاب الإيمان</span></a>
      <a href="https://shamela.ws/book/1727/61"><span class="text-black">(١) باب بيان الإيمان</span></a>
    </div>
    <div class="nass margin-top-10">
      <p><span id="p1" class="anchor"></span>١ - (٨) <a href="/narrator/123">أَبُو خَيْثَمَةَ</a> زُهَيْرُ بْنُ حَرْبٍ<a href="#p1" class="btn_tag btn btn-sm"><span class="text-gray fa fa-copy"></span></a></p>
      <p><span id="p2" class="anchor"></span>⦗٣٧⦘<a href="#p2" class="btn_tag btn btn-sm"></a></p>
      <p><span id="p3" class="anchor"></span>٤ - (٨) وحدثني حجاج بن الشاعر<a href="#p3" class="btn_tag btn btn-sm"></a></p>
      <hr />
      <p class="hamesh">(أول من قال بالقدر) معناه … رواه البخاري برقم (٥٠)</p>
    </div>
    <script>_book_id = "1727"; _page_id = "62";</script>
    </body></html>`;
  const p = parseBookPage(html);
  assert.equal(p.book_id, "1727");
  assert.equal(p.page_id, "62");
  assert.equal(p.hadith_number_hint, "8");
  assert.equal(p.volume, "1");
  assert.equal(p.printed_page, "36");
  assert.deepEqual(p.nav, { prev: "61", next: "63", last: "7495" });
  assert.deepEqual(p.chapter_path.map((c) => c.title), ["١ - كتاب الإيمان", "(١) باب بيان الإيمان"]);
  assert.deepEqual(detectHadithNumbers(p.paragraphs), ["8"]);
  assert.deepEqual(p.narrator_links, [{ narrator_id: "123", name: "أَبُو خَيْثَمَةَ", url: "https://shamela.ws/narrator/123", paragraph: 0 }]);
  assert.equal(p.footnotes.length, 1);
});

test("minimal markup without <p> still yields content (backwards compatibility)", () => {
  const p = parseBookPage(`<div class="nass">حدثنا الحميدي ... فبينا نحن عنده</div><div class="next">`);
  assert.deepEqual(p.paragraphs, ["حدثنا الحميدي ... فبينا نحن عنده"]);
  assert.equal(p.footnotes.length, 0);
  assert.deepEqual(p.nav, { prev: null, next: null, last: null });
});

test("volume/printed page fall back to <title> when nav inputs are absent", () => {
  const p = parseBookPage(`<title>ج3 - ص117 - كتاب X - باب Y - المكتبة الشاملة</title><div class="nass"><p>x</p></div>`);
  assert.equal(p.volume, "3");
  assert.equal(p.printed_page, "117");
});
