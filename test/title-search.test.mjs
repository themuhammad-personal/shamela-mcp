import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../src/lib/shamela.mjs";

test("titleSearch sends the raw query to /ajax/book (shamela normalises server-side)", async () => {
  const captured = [];
  const text = (url) => {
    captured.push(String(url));
    return Promise.resolve(
      JSON.stringify({ results: { items: [{ id: 9472, text: "إحياء علوم الدين" }] } }),
    );
  };
  const client = createClient({ base: "https://shamela.test", text });

  const out = await client.titleSearch("إحياء", 1, 10);

  assert.equal(captured.length, 1);
  const term = new URL(captured[0]).searchParams.get("term");
  assert.equal(term, "إحياء", "raw query must reach shamela unchanged");
  assert.notEqual(term, "احياا", "pre-normalised query makes /ajax/book return zero hits");
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].book_id, "9472");
  assert.equal(out.normalized_query, "احياا", "normalized_query stays informational");
});
