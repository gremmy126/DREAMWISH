import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";

export async function GET(request: Request) {
  await requireAdminContext(request);
  const configured = (names: string[]) => names.every((name) => Boolean(process.env[name]?.trim()));
  return NextResponse.json({
    ok: true,
    services: [
      { id: "postgres", name: "PostgreSQL", configured: configured(["DATABASE_URL"]) },
      { id: "polar", name: "Polar", configured: configured(["POLAR_ACCESS_TOKEN", "POLAR_PRODUCT_ID", "POLAR_WEBHOOK_SECRET"]) },
      { id: "kakao", name: "Kakao OAuth", configured: configured(["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "KAKAO_REDIRECT_URI"]) },
      { id: "naver", name: "Naver OAuth", configured: configured(["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "NAVER_REDIRECT_URI"]) },
      { id: "firebase", name: "Firebase", configured: configured(["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]) },
      { id: "automation", name: "Automation Worker", configured: configured(["DATABASE_URL", "AUTOMATION_CREDENTIAL_KEY"]) }
    ]
  });
}
