import assert from "node:assert/strict";
import fs from "node:fs";

test("Files workspace exposes folders filters moves and authenticated downloads", () => {
  const source = fs.readFileSync("components/Files/FilesView.tsx", "utf8");
  assert.match(source, /새 폴더/u);
  assert.match(source, /다운로드/u);
  assert.match(source, /`\/api\/files\/\$\{file\.id\}\/download`/u);
  assert.match(source, /method: "PATCH"/u);
  assert.match(source, /activeCategory/u);
  assert.match(source, /folderId/u);
  assert.match(source, /원본 파일 없음/u);
});

test("Files and AI Chat upload original bytes with FormData", () => {
  const files = fs.readFileSync("components/Files/FilesView.tsx", "utf8");
  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(files, /new FormData\(\)/u);
  assert.match(files, /form\.set\("file", file\)/u);
  assert.match(chat, /new FormData\(\)/u);
  assert.match(chat, /form\.set\("source", "aichat"\)/u);
  assert.doesNotMatch(chat, /name: file\.name,[\s\S]{0,240}source: "aichat"/u);
});
