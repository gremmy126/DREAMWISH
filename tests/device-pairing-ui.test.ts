import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PANEL_PATH = "components/Business/DeviceConnectionPanel.tsx";
const PAIR_PAGE_PATH = "app/companion/pair/page.tsx";

test("device pairing panel renders an HTTPS QR value with normal-camera instructions", () => {
  const panel = source(PANEL_PATH);

  assert.match(panel, /QRCodeSVG/u);
  assert.match(panel, /value=\{session\.fallbackUrl\}/u, "the QR must encode the HTTPS universal link, not the custom scheme");
  assert.match(panel, /기본 카메라/u);
  assert.doesNotMatch(panel, /value=\{session\.pairingUrl\}/u);
});

test("device pairing panel follows the approved QR state machine", () => {
  const panel = source(PANEL_PATH);

  for (const state of ["idle", "creating", "awaiting_phone", "awaiting_web_code", "active", "expired", "error"]) {
    assert.match(panel, new RegExp(`"${state}"`, "u"), `state ${state} must exist`);
  }
  assert.match(panel, /awaiting_confirmation/u, "server awaiting_confirmation must map to the web code entry state");
  assert.match(panel, /pairing-challenges\/\$\{encodeURIComponent\(session\.sessionId\)\}\/status/u);
  assert.match(panel, /pairing-challenges\/\$\{encodeURIComponent\(session\.sessionId\)\}\/confirm/u);
});

test("device pairing panel accepts the phone-shown code on the web with expiry countdown", () => {
  const panel = source(PANEL_PATH);

  assert.match(panel, /휴대폰에 표시된 6자리/u);
  assert.match(panel, /확인 코드는 휴대폰 화면에 표시되고, 입력은 이 웹 화면에서 합니다/u);
  assert.match(panel, /inputMode="numeric"/u);
  assert.match(panel, /pattern="\[0-9\]\{6\}"/u);
  assert.match(panel, /남은 시간/u);
  assert.match(panel, /secondsUntil/u);
  assert.doesNotMatch(panel, /challenge\.code/u, "the web must never display a website-generated pairing code");
});

test("device pairing panel stops polling on terminal states and unmount and returns focus", () => {
  const panel = source(PANEL_PATH);

  assert.match(panel, /uiState === "active" \|\| uiState === "expired" \|\| uiState === "error"/u);
  assert.match(panel, /controller\.abort\(\);/u);
  assert.match(panel, /clearInterval\(interval\);/u);
  assert.match(panel, /openerRef\.current\?\.focus\(\)/u);
  assert.match(panel, /aria-live="polite"/u);
  assert.match(panel, /role="status"/u);
  assert.match(panel, /aria-modal="true"/u);
});

test("iPhone pairing never claims automatic bank-notification reading", () => {
  const panel = source(PANEL_PATH);

  assert.match(panel, /iPhone에서는 은행 알림을 자동으로 읽을 수 없습니다/u);
  assert.match(panel, /공유 확장으로 직접 공유한/u);
  assert.match(panel, /iPhone은 다른 앱의 알림을 자동으로 읽을 수 없어/u);
  const iphoneSentences = panel.match(/[^.>]*iPhone[^.<]*수집[^.<]*/gu) || [];
  for (const sentence of iphoneSentences) {
    assert.match(sentence, /없|직접 공유/u, `iPhone collection wording must stay explicit: ${sentence}`);
  }
});

test("the universal-link fallback page guides installation without leaking the token", () => {
  const page = source(PAIR_PAGE_PATH);

  assert.match(page, /dreamwish:\/\/companion\/pair/u);
  assert.match(page, /앱에서 계속하기/u);
  assert.doesNotMatch(page, /localStorage|sessionStorage/u);
  assert.doesNotMatch(page, /fetch\(/u, "the fallback page must not spend the one-time token itself");
});

test("assetlinks.json serves the verified Android package and fingerprint", async () => {
  await withEnv({
    ANDROID_APP_PACKAGE: "kr.co.dreamwish.companion",
    ANDROID_APP_SHA256_CERT_FINGERPRINT: Array.from({ length: 32 }, () => "AB").join(":")
  }, async () => {
    const route = requireProjectModule<{ GET: () => Promise<Response> }>("app/.well-known/assetlinks.json/route.ts");
    const response = await route.GET();
    const body = (await response.json()) as Array<{
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/json/u);
    assert.equal(body[0]?.relation[0], "delegate_permission/common.handle_all_urls");
    assert.equal(body[0]?.target.namespace, "android_app");
    assert.equal(body[0]?.target.package_name, "kr.co.dreamwish.companion");
    assert.equal(body[0]?.target.sha256_cert_fingerprints[0], Array.from({ length: 32 }, () => "AB").join(":"));
  });
});

test("assetlinks.json returns an empty statement list without a valid fingerprint", async () => {
  await withEnv({ ANDROID_APP_SHA256_CERT_FINGERPRINT: "not-a-fingerprint" }, async () => {
    const route = requireProjectModule<{ GET: () => Promise<Response> }>("app/.well-known/assetlinks.json/route.ts");
    const body = (await (await route.GET()).json()) as unknown[];
    assert.deepEqual(body, []);
  });
});

test("apple-app-site-association serves the team-scoped app ID and pairing paths", async () => {
  await withEnv({ APPLE_TEAM_ID: "TEAM123456", APPLE_BUNDLE_ID: "kr.co.dreamwish.companion" }, async () => {
    const route = requireProjectModule<{ GET: () => Promise<Response> }>("app/.well-known/apple-app-site-association/route.ts");
    const response = await route.GET();
    const body = (await response.json()) as {
      applinks: { apps: unknown[]; details: Array<{ appID: string; paths: string[] }> };
    };

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/json/u);
    assert.deepEqual(body.applinks.apps, []);
    assert.equal(body.applinks.details[0]?.appID, "TEAM123456.kr.co.dreamwish.companion");
    assert.deepEqual(body.applinks.details[0]?.paths, ["/pair", "/companion/pair"]);
  });
});

test("apple-app-site-association has no app detail before the team ID is configured", async () => {
  await withEnv({ APPLE_TEAM_ID: undefined }, async () => {
    const route = requireProjectModule<{ GET: () => Promise<Response> }>("app/.well-known/apple-app-site-association/route.ts");
    const body = (await (await route.GET()).json()) as { applinks: { details: unknown[] } };
    assert.deepEqual(body.applinks.details, []);
  });
});

test("companion association environment names are documented without real values", () => {
  const env = source(".env.example");

  assert.match(env, /ANDROID_APP_PACKAGE="kr\.co\.dreamwish\.companion"/u);
  assert.match(env, /ANDROID_APP_SHA256_CERT_FINGERPRINT=""/u);
  assert.match(env, /APPLE_TEAM_ID=""/u);
  assert.match(env, /APPLE_BUNDLE_ID="kr\.co\.dreamwish\.companion"/u);
});

function source(filePath: string) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return fs.readFileSync(filePath, "utf8");
}

function requireProjectModule<T>(relativePath: string): T {
  const moduleLoader = require("node:module") as {
    _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string;
  };
  const originalResolve = moduleLoader._resolveFilename;
  moduleLoader._resolveFilename = function resolveProjectAlias(
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown
  ) {
    const mapped = request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request;
    return originalResolve.call(this, mapped, parent, isMain, options);
  };
  try {
    return require(path.join(process.cwd(), relativePath)) as T;
  } finally {
    moduleLoader._resolveFilename = originalResolve;
  }
}

async function withEnv(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>
) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    process.env = original;
  }
}
