import { NextResponse } from "next/server";
import { classifyAdminAuthError, requireAdminContext } from "@/src/lib/admin/admin-guard";
import { listAllAccessGrants } from "@/src/lib/coupons/coupon.repository";
import { listDomesticSubscriptions } from "@/src/lib/billing/subscription.repository";

// 관리자 구독·이용권 대시보드. 사용자 ID 조회 없이도 처음 화면에 활성 구독과
// 최근 발급된 이용권 목록·요약을 보여준다. 저장소(Postgres 등)가 아직
// 준비되지 않았더라도 화면이 비지 않도록 각 목록은 실패 시 빈 배열로 흡수한다.
export async function GET(request: Request) {
  try {
    await requireAdminContext(request);
    const [grants, subscriptions] = await Promise.all([
      listAllAccessGrants(100).catch(() => []),
      listDomesticSubscriptions(100).catch(() => [])
    ]);
    const activeGrants = grants.filter((grant) => grant.status === "active").length;
    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === "active" || subscription.status === "past_due"
    ).length;
    return NextResponse.json({
      ok: true,
      grants,
      subscriptions,
      stats: {
        activeGrants,
        totalGrants: grants.length,
        activeSubscriptions,
        totalSubscriptions: subscriptions.length
      }
    });
  } catch (error) {
    const info = classifyAdminAuthError(error);
    if (info) {
      return NextResponse.json({ ok: false, error: info.message }, { status: info.status });
    }
    return NextResponse.json(
      { ok: false, error: "구독·이용권 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
