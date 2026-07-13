"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { AccessState } from "@/src/lib/auth/access-control";

type AccessContextValue = {
  access: AccessState;
  refreshAccess: () => Promise<AccessState>;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({
  initialAccess,
  children
}: {
  initialAccess: AccessState;
  children: ReactNode;
}) {
  const [access, setAccess] = useState(initialAccess);

  const refreshAccess = useCallback(async () => {
    const response = await fetch("/api/billing/status", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as
      | { access?: AccessState; error?: string }
      | null;
    if (!response.ok || !payload?.access) {
      throw new Error(payload?.error || "구독 상태를 확인하지 못했습니다.");
    }
    setAccess(payload.access);
    return payload.access;
  }, []);

  const value = useMemo(() => ({ access, refreshAccess }), [access, refreshAccess]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider");
  return value;
}
