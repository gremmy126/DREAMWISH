import { BrainLogo } from "@/components/brand/BrainLogo";

export function AuthRestoringScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-app-bg"
      role="status"
      aria-live="polite"
      aria-label="로그인 상태 확인 중"
    >
      <div className="flex items-center gap-3 text-app-primary">
        <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-2xl bg-app-primary text-white shadow-soft">
          <BrainLogo className="h-7 w-7" />
        </span>
        <span className="sr-only">로그인 상태를 확인하고 있습니다.</span>
      </div>
    </div>
  );
}
