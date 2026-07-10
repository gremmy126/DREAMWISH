import assert from "node:assert/strict";
import { decodeHtmlEntities, normalizeSearchText } from "../src/lib/search/search-text";

test("decodeHtmlEntities decodes decimal, hex, and named entities", () => {
  assert.equal(decodeHtmlEntities("C&#225;ch X&#243;a &#194;m Thanh"), "Cách Xóa Âm Thanh");
  assert.equal(decodeHtmlEntities("R&#233;solu"), "Résolu");
  assert.equal(decodeHtmlEntities("Fran&#xE7;ais &amp; Deutsch"), "Français & Deutsch");
});

test("normalizeSearchText removes html tags, scripts, comments, controls, and extra space", () => {
  const input = "<p>C&#225;ch</p><script>alert(1)</script><!--x--><br> &#013;&#032;Canva\u0007";

  assert.equal(normalizeSearchText(input), "Cách Canva");
});

test("normalizeSearchText preserves multilingual unicode accents", () => {
  const input = "한글 日本語 Français Résolu Tiếng Việt Cách Español Deutsch";

  assert.equal(normalizeSearchText(input), input);
});
