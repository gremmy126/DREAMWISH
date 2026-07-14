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

test("successful file changes refresh account storage", () => {
  const files = fs.readFileSync("components/Files/FilesView.tsx", "utf8");
  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(files, /dreamwish:storage-updated/u);
  assert.match(chat, /dreamwish:storage-updated/u);
  assert.match(files, /method: "DELETE"/u);
  assert.match(files, /삭제/u);
});

test("Railway bucket variables and persistent data mount are documented", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  for (const name of [
    "STORAGE_BUCKET_NAME",
    "STORAGE_BUCKET_ACCESS_KEY_ID",
    "STORAGE_BUCKET_SECRET_ACCESS_KEY",
    "STORAGE_BUCKET_REGION",
    "STORAGE_BUCKET_ENDPOINT"
  ]) {
    assert.match(env, new RegExp(`^${name}=`, "mu"));
  }
  const docs = fs.readFileSync("docs/railway-auth-and-memory.md", "utf8");
  assert.match(docs, /dreamwish-data/u);
  assert.match(docs, /dreamwish-files/u);
  assert.match(docs, /DATA_DIR=\/data/u);
  assert.match(docs, /NEXT_PUBLIC_/u);
});
