import assert from "node:assert/strict";
import fs from "node:fs";

// 관리자 '구독·이용권' 화면이 처음 열렸을 때 비어 보이던 문제: 사용자 ID를
// 입력해 조회해야만 결과가 떴다. 이제 마운트 시 전체 활성 구독·발급 이용권을
// 보여준다.
test("admin subscription/entitlement overview API is admin-guarded and resilient", () => {
  const route = fs.readFileSync("app/api/admin/access-grants/route.ts", "utf8");
  assert.match(route, /requireAdminContext/u);
  assert.match(route, /classifyAdminAuthError/u);
  assert.match(route, /listAllAccessGrants/u);
  assert.match(route, /listDomesticSubscriptions/u);
  // 저장소 미준비 시에도 화면이 비지 않도록 실패를 빈 배열로 흡수한다.
  assert.match(route, /\.catch\(\(\)\s*=>\s*\[\]\)/u);
});

test("the repositories expose cross-user list functions for the dashboard", () => {
  const coupon = fs.readFileSync("src/lib/coupons/coupon.repository.ts", "utf8");
  const subscription = fs.readFileSync("src/lib/billing/subscription.repository.ts", "utf8");
  assert.match(coupon, /export async function listAllAccessGrants/u);
  assert.match(subscription, /export async function listDomesticSubscriptions/u);
});

test("the admin access-grants view loads the overview on mount, not only on manual lookup", () => {
  const view = fs.readFileSync("components/Admin/AdminAccessGrants.tsx", "utf8");
  assert.match(view, /\/api\/admin\/access-grants/u);
  assert.match(view, /useEffect\(/u);
  assert.match(view, /활성 구독/u);
  assert.match(view, /발급된 이용권/u);
  // 기존 사용자별 지급·회수 기능은 유지.
  assert.match(view, /지급/u);
  assert.match(view, /회수/u);
});
