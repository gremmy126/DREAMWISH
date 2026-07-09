import { AuthGate } from "@/components/auth/AuthGate";
import { LoginSuccess } from "./success";

export default function LoginPage() {
  return (
    <AuthGate>
      <LoginSuccess />
    </AuthGate>
  );
}
