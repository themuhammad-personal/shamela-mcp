import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToLines, parseNarratorTarjama, parseAuthorBiography, datesFromHeadline } from "../src/lib/tarjama.mjs";
import { createClient } from "../src/lib/shamela.mjs";

// Modelled line-for-line on the live pages (2026-09-03):
//   https://shamela.ws/narrator/4210  (== /ajax/tarjama/4210)
//   https://shamela.ws/author/215     (البخاري)
// Only the chrome around the content is abbreviated.

const NARRATOR_HTML = `<!doctype html><html><head><title>عبد الرزاق بن همام - المكتبة الشاملة</title>
<script>var x = "الاسم: لا";</script></head><body>
<nav><a href="/">الرئيسية</a></nav>
<div class="container"><h1>عبد الرزاق بن همام</h1>
<div class="tarjama">
<p><b>الاسم:</b> عبد الرزاق بن همام بن نافع</p>
<p><b>اللقب:</b> الصنعاني</p>
<p><b>الكنية:</b> أبو بكر</p>
<p><b>النسب:</b> الحميري، الصنعاني، اليماني</p>
<p><b>علاقات الراوي:</b> مولى حمير</p>
<p><b>المذهب العقدي:</b> رمي بالتشيع</p>
<p><b>تاريخ الميلاد:</b> ١٢٨ هـ</p>
<p><b>تاريخ الوفاة:</b> ٢١١ هـ أو ٢١٢ هـ</p>
<p><b>بلد الوفاة:</b> صنعاء</p>
<p><b>بلد الرحلة:</b> الحجاز، الشام، العراق</p>
<p><b>طبقة رواة التقريب:</b> كبار الآخذين عن تبع الأتباع</p>
<p><b>الرتبة عند ابن حجر:</b> ثقة حافظ مصنف شهير عمي في آخر عمره فتغير وكان يتشيع</p>
<p><b>الرتبة عند الذهبي:</b> أحد الأعلام الثقات</p>
<h4>الجرح والتعديل:</h4>
<div>ابن حبان</div>
<div><b>ذكره في الثقات، وقال: كان ممن جمع وصنف</b> [الثقات (8/ 412)]</div>
<div>ابن حجر</div>
<div><b>ثقة حافظ مصنف شهير عمي في آخر عمره فتغير وكان يتشيع</b> [تقريب التهذيب (1/ 354)]</div>
<div>الذهبى</div>
<div><b>أحد الأعلام الثقات</b> [الكاشف (1/ 651)]</div>
<div><b>ثقة على تشيع فيه.</b> [ميزان الاعتدال (2/ 609)]</div>
<div>يحيى بن معين</div>
<div><b>ثقة</b> [تهذيب التهذيب (6/ 311)]</div>
</div></div>
<footer><a href="/page/about">حول المشروع</a><a href="/page/contact">اتصل بنا</a></footer>
</body></html>`;

const AUTHOR_HTML = `<!doctype html><html><body>
<div class="container"><h1>البخاري</h1>
<h3>كتب المؤلف</h3>
<ul><li><a class="book_title text-primary" href="/book/1681"><b>صحيح البخاري - ط السلطانية</b></a></li>
<li><a class="book_title text-primary" href="/book/9725"><b>الأدب المفرد</b></a></li></ul>
<h4>تعريف بالمؤلف</h4>
<div class="nass">
<p>البُخاري (١٩٤ - ٢٥٦ هـ = ٨١٠ - ٨٧٠ م)</p>
<p>محمد بن إسماعيل بن إبراهيم بن المغيرة البخاري، أبو عبد الله:</p>
<p>• حبر الإسلام، والحافظ لحديث رسول الله صلى الله عليه وسلم.</p>
<p>• ولد في بخارى، ونشأ يتيما، وقام برحلة طويلة في طلب الحديث (١)</p>
<p>• توفي في خرتنك (من قرى سمرقند)</p>
<p>صاحب:</p>
<p>• (الجامع الصحيح - ط) المعروف بصحيح البخاري</p>
<p>• (التاريخ الكبير - ط)</p>
<p>_________</p>
<p>(١) تذكرة الحفاظ ٢: ١٢٢ وتاريخ بغداد ٢: ٤</p>
<p>نقلا عن: «الأعلام» للزركلي</p>
</div></div>
<footer><a href="/page/about">حول المشروع</a></footer>
</body></html>`;

test("htmlToLines: blocks/<br> → lines; scripts & styles dropped", () => {
  const l = htmlToLines(`<script>var a="x: y";</script><p>أ</p><div>ب<br>ج</div><style>.q{}</style>`);
  assert.deepEqual(l, ["أ", "ب", "ج"]);
});

test("parseNarratorTarjama: labelled fields + rank lines quoted verbatim + hijri numbers", () => {
  const t = parseNarratorTarjama(NARRATOR_HTML);
  assert.equal(t.found, true);
  assert.equal(t.name, "عبد الرزاق بن همام بن نافع");
  assert.equal(t.laqab, "الصنعاني");
  assert.equal(t.kunya, "أبو بكر");
  assert.equal(t.creed, "رمي بالتشيع");
  assert.equal(t.born_hijri, 128);
  assert.equal(t.died, "٢١١ هـ أو ٢١٢ هـ");
  assert.equal(t.died_hijri, 211, "first printed year is the primary one");
  assert.deepEqual(t.died_hijri_candidates, [211, 212], "both candidate years preserved, never averaged");
  assert.equal(t.death_place, "صنعاء");
  assert.equal(t.tabaqa_taqrib, "كبار الآخذين عن تبع الأتباع");
  assert.equal(t.rank_ibn_hajar, "ثقة حافظ مصنف شهير عمي في آخر عمره فتغير وكان يتشيع");
  assert.equal(t.rank_dhahabi, "أحد الأعلام الثقات");
  assert.equal(t.fields["علاقات الراوي"], "مولى حمير", "unknown/extra labels are still kept raw");
  assert.equal("reliability" in t, false, "no computed grade");
});

test("parseNarratorTarjama: jarh wa ta'dil grouped by critic, each statement with its printed source", () => {
  const t = parseNarratorTarjama(NARRATOR_HTML);
  assert.deepEqual(t.critics, ["ابن حبان", "ابن حجر", "الذهبى", "يحيى بن معين"]);
  assert.equal(t.statement_count, 5);
  const dh = t.jarh_wa_tadil.find((g) => g.critic === "الذهبى");
  assert.deepEqual(dh.statements, [
    { text: "أحد الأعلام الثقات", source: "الكاشف (1/ 651)" },
    { text: "ثقة على تشيع فيه.", source: "ميزان الاعتدال (2/ 609)" },
  ]);
  assert.equal(t.jarh_wa_tadil.find((g) => g.critic === "ابن حبان").statements[0].source, "الثقات (8/ 412)");
  // the page's own footer/nav words never become critics
  assert.ok(!t.critics.includes("حول المشروع") && !t.critics.includes("الرئيسية"));
});

test("parseNarratorTarjama: empty/unknown narrator page → found:false, no guessing", () => {
  const t = parseNarratorTarjama(`<html><body><h1>المكتبة الشاملة</h1><p>لا توجد نتائج</p></body></html>`);
  assert.equal(t.found, false);
  assert.equal(t.reason, "no_tarjama_content");
  assert.deepEqual(t.jarh_wa_tadil, []);
});

test("datesFromHeadline: الأعلام-style headlines", () => {
  assert.deepEqual(datesFromHeadline("البُخاري (١٩٤ - ٢٥٦ هـ = ٨١٠ - ٨٧٠ م)"), { born_hijri: 194, died_hijri: 256, born_ce: 810, died_ce: 870 });
  assert.deepEqual(datesFromHeadline("ابن القيم (٦٩١ - ٧٥١ هـ = ١٢٩٢ - ١٣٥٠ م)"), { born_hijri: 691, died_hijri: 751, born_ce: 1292, died_ce: 1350 });
  assert.deepEqual(datesFromHeadline("فلان (٠٠٠ - ٣١٠ هـ = ٠٠٠ - ٩٢٣ م)"), { born_hijri: null, died_hijri: 310, born_ce: null, died_ce: 923 });
  assert.deepEqual(datesFromHeadline("فلان (ت ٢٥٦ هـ)"), { born_hijri: null, died_hijri: 256, born_ce: null, died_ce: null });
  assert.deepEqual(datesFromHeadline("فلان"), { born_hijri: null, died_hijri: null, born_ce: null, died_ce: null });
});

test("parseAuthorBiography: headline, full name, bullets, works, footnote refs, source", () => {
  const b = parseAuthorBiography(AUTHOR_HTML);
  assert.equal(b.found, true);
  assert.equal(b.headline, "البُخاري (١٩٤ - ٢٥٦ هـ = ٨١٠ - ٨٧٠ م)");
  assert.equal(b.full_name, "محمد بن إسماعيل بن إبراهيم بن المغيرة البخاري، أبو عبد الله:");
  assert.equal(b.born_hijri, 194);
  assert.equal(b.died_hijri, 256);
  assert.equal(b.died_ce, 870);
  assert.equal(b.biography.length, 3);
  assert.ok(b.biography[0].startsWith("حبر الإسلام"));
  assert.deepEqual(b.works, ["(الجامع الصحيح - ط) المعروف بصحيح البخاري", "(التاريخ الكبير - ط)"]);
  assert.deepEqual(b.references, ["(١) تذكرة الحفاظ ٢: ١٢٢ وتاريخ بغداد ٢: ٤"]);
  assert.equal(b.source, "«الأعلام» للزركلي");
});

test("parseAuthorBiography: author page without the section → found:false", () => {
  const b = parseAuthorBiography(`<html><body><h1>مجهول</h1><h3>كتب المؤلف</h3><ul><li><a href="/book/1"><b>كتاب</b></a></li></ul></body></html>`);
  assert.deepEqual(b, { found: false, reason: "no_biography_section" });
});

test("client.authorBooks attaches the biography; client.narratorTarjama hits /narrator/<id>", async () => {
  const seen = [];
  const client = createClient({
    text: async (url) => {
      seen.push(url);
      if (url.endsWith("/author/215")) return AUTHOR_HTML;
      if (url.endsWith("/narrator/4210")) return NARRATOR_HTML;
      throw new Error("unexpected " + url);
    },
  });
  const a = await client.authorBooks("215");
  assert.equal(a.author, "البخاري");
  assert.equal(a.books.length, 2);
  assert.equal(a.biography_status, "found");
  assert.equal(a.biography.died_hijri, 256);
  assert.equal(a.biography.source, "«الأعلام» للزركلي");

  const n = await client.narratorTarjama("4210");
  assert.equal(n.narrator_id, "4210");
  assert.equal(n.url, "https://shamela.ws/narrator/4210");
  assert.equal(n.heading, "عبد الرزاق بن همام");
  assert.equal(n.found, true);
  assert.equal(n.critics.length, 4);
  assert.deepEqual(seen, ["https://shamela.ws/author/215", "https://shamela.ws/narrator/4210"], "exactly one upstream request each");
});
