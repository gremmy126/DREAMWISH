import assert from "node:assert/strict";
import fs from "node:fs";

test("Railway deployment contract lists social login coupon and Polar discount requirements", () => {
  const docs = read("docs/railway-auth-coupon-env.md");
  for (const name of [
    "KAKAO_CLIENT_ID",
    "KAKAO_CLIENT_SECRET",
    "KAKAO_REDIRECT_URI",
    "NAVER_CLIENT_ID",
    "NAVER_CLIENT_SECRET",
    "NAVER_REDIRECT_URI",
    "AUTH_OAUTH_STATE_SECRET",
    "COUPON_HASH_SECRET"
  ]) assert.match(docs, new RegExp(name, "u"));
  assert.match(docs, /https:\/\/dreamwish\.co\.kr\/api\/auth\/oauth\/kakao\/callback/u);
  assert.match(docs, /https:\/\/dreamwish\.co\.kr\/api\/auth\/oauth\/naver\/callback/u);
  assert.match(docs, /Polar[\s\S]*Discount/u);
  assert.match(docs, /이메일.*동의/u);

  const env = read(".env.example");
  assert.match(env, /COUPON_HASH_SECRET=""/u);
});

test("legal policies disclose social identity coupons and seven-day deletion", () => {
  const privacy = read("app/privacy/page.tsx");
  const terms = read("app/terms/page.tsx");
  for (const source of [privacy, terms]) {
    assert.match(source, /카카오|Kakao/u);
    assert.match(source, /네이버|Naver/u);
    assert.match(source, /쿠폰/u);
  }
  assert.match(privacy, /7일/u);
  assert.match(terms, /이용권형/u);
  assert.match(terms, /할인형/u);
  assert.match(terms, /관계 법령/u);
});

test("public structured data does not advertise a nonexistent free plan", () => {
  const page = read("app/page.tsx");
  assert.match(page, /isAccessibleForFree:\s*false/u);
  assert.doesNotMatch(page, /price:\s*"0"/u);
});

test("README links operator setup for authentication coupons and automation", () => {
  const readme = read("README.md");
  assert.match(readme, /railway-auth-coupon-env\.md/u);
  assert.match(readme, /자동화 사용 가이드/u);
});

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}
