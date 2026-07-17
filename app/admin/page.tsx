import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/Admin/AdminShell";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/src/lib/auth/session-token";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  const account = claims ? await getOperationalAccount(claims.uid) : null;
  const role = account?.role || claims?.role;
  const active = account ? account.status === "active" : true;
  if (!claims || role !== "admin" || !active) redirect("/");

  return <AdminShell account={{ email: claims.email, name: account?.name || claims.name }} />;
}

