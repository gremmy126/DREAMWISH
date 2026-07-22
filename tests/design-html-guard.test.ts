import assert from "node:assert/strict";
import { inspectGeneratedHtml } from "../src/lib/design/html-guard";

test("clean generated pages pass the HTML guard", () => {
  const html =
    '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">' +
    "<style>body{margin:0}</style></head><body><main><h1>안녕하세요</h1>" +
    '<button type="button">시작하기</button></main></body></html>';
  const report = inspectGeneratedHtml(html);
  assert.equal(report.safe, true);
  assert.equal(report.findings.length, 0);
});

test("iframe escape and cookie access are critical", () => {
  const report = inspectGeneratedHtml(
    "<html><script>window.top.location = 'https://evil.example'; document.cookie;</script></html>"
  );
  assert.equal(report.safe, false);
  const codes = report.findings.map((finding) => finding.code);
  assert.ok(codes.includes("iframe-escape"));
  assert.ok(codes.includes("cookie-access"));
});

test("tracker scripts are blocked as critical", () => {
  const report = inspectGeneratedHtml(
    '<html><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></html>'
  );
  assert.equal(report.safe, false);
  assert.ok(report.findings.some((finding) => finding.code === "tracker"));
});

test("unlisted CDNs and external fetches warn without blocking", () => {
  const report = inspectGeneratedHtml(
    '<html><script src="https://random-cdn.example.com/lib.js"></script>' +
    "<script>fetch('https://api.example.com/data')</script></html>"
  );
  assert.equal(report.safe, true);
  const codes = report.findings.map((finding) => finding.code);
  assert.ok(codes.includes("unlisted-cdn"));
  assert.ok(codes.includes("network-call"));
});

test("obfuscated eval payloads are critical", () => {
  const report = inspectGeneratedHtml(
    `<script>eval(atob("${"QUFB".repeat(20)}"))</script>`
  );
  assert.equal(report.safe, false);
  assert.ok(report.findings.some((finding) => finding.code === "obfuscated-eval"));
});
