import assert from "node:assert/strict";
import {
  classifyAgentRequest,
  extractArtifact,
  kindFromFileName
} from "../src/lib/agent/agent-build";

test("agent request classification infers artifact kind from natural chat", () => {
  assert.equal(classifyAgentRequest("포트폴리오 웹사이트 만들어줘"), "website");
  assert.equal(classifyAgentRequest("할 일 앱 하나 만들어줘"), "app");
  assert.equal(classifyAgentRequest("보라색 별 로고 그려줘"), "image");
  assert.equal(classifyAgentRequest("CSV 합치는 파이썬 스크립트 짜줘"), "program");
  assert.equal(classifyAgentRequest("배경을 어둡게 바꿔줘"), null);
});

test("extractArtifact recovers truncated model output instead of failing", () => {
  // 토큰 한도로 잘린 HTML — 닫는 태그가 없어도 살려서 미리보기가 동작해야 한다.
  const truncatedHtml = "<!DOCTYPE html>\n<html><head><style>body{}</style></head><body><div>내용";
  assert.equal(extractArtifact(truncatedHtml, "website"), truncatedHtml);

  // 닫는 펜스가 잘린 경우.
  const openFenced = "```html\n<!DOCTYPE html>\n<html><body>hi</body></html>";
  assert.match(extractArtifact(openFenced, "website"), /^<!DOCTYPE html>/u);

  // 잘린 SVG는 닫아서 렌더링한다.
  const truncatedSvg = '설명입니다\n<svg viewBox="0 0 10 10"><circle cx="5"';
  assert.match(extractArtifact(truncatedSvg, "image"), /<\/svg>$/u);

  // 본문 조각만 온 경우 문서로 감싼다.
  assert.match(extractArtifact("<div>조각</div>", "app"), /^<!DOCTYPE html>/u);
});

test("folder file extension maps to artifact kind", () => {
  assert.equal(kindFromFileName("index.html"), "website");
  assert.equal(kindFromFileName("logo.SVG"), "image");
  assert.equal(kindFromFileName("script.py"), "program");
});
