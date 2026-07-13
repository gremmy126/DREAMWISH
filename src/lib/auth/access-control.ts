export const ADMIN_EMAIL = "kara111131@naver.com" as const;
export const AUTH_SESSION_KEY = "dreamwish-auth-session-v1";

type Whitespace = " " | "\n" | "\r" | "\t";
type TrimLeft<Value extends string> = Value extends `${Whitespace}${infer Rest}`
  ? TrimLeft<Rest>
  : Value;
type TrimRight<Value extends string> = Value extends `${infer Rest}${Whitespace}`
  ? TrimRight<Rest>
  : Value;
type Trim<Value extends string> = TrimLeft<TrimRight<Value>>;
type NormalizedEmail<Value extends string> = Lowercase<Trim<Value>>;
type IsAdmin<Value extends string> = NormalizedEmail<Value> extends typeof ADMIN_EMAIL
  ? true
  : false;
type CanUseApp = true;

export type AccountRole = "admin" | "user";

export type AccessState = {
  email: string;
  role: AccountRole;
  paid: boolean;
  adminBypass: boolean;
  canUseApp: boolean;
  requiresPayment: boolean;
};

export type BuildAccessStateResult<
  Email extends string,
  Paid extends boolean
> = AccessState & {
  email: NormalizedEmail<Email>;
  role: IsAdmin<Email> extends true ? "admin" : "user";
  paid: IsAdmin<Email> extends true ? true : Paid;
  adminBypass: IsAdmin<Email>;
  canUseApp: CanUseApp;
  requiresPayment: false;
};

export function normalizeEmail<Email extends string>(email: Email): NormalizedEmail<Email> {
  return email.trim().toLowerCase() as NormalizedEmail<Email>;
}

export function isAdminEmail<Email extends string>(
  email: Email
): IsAdmin<Email> extends true ? true : boolean {
  return (normalizeEmail(email) === ADMIN_EMAIL) as IsAdmin<Email> extends true
    ? true
    : boolean;
}

export function buildAccessState<Email extends string, Paid extends boolean>(input: {
  email: Email;
  paid: Paid;
}): BuildAccessStateResult<Email, Paid> {
  const email = normalizeEmail(input.email);
  const adminBypass = email === ADMIN_EMAIL;
  const paid = adminBypass ? true : input.paid;
  return {
    email,
    role: adminBypass ? "admin" : "user",
    paid,
    adminBypass,
    canUseApp: true,
    requiresPayment: false
  } as BuildAccessStateResult<Email, Paid>;
}

export function stringifyUnknownError(error: Event): "로그인 처리 중 오류가 발생했습니다.";
export function stringifyUnknownError(error: unknown): string;
export function stringifyUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof Event !== "undefined" && error instanceof Event) {
    return "로그인 처리 중 오류가 발생했습니다.";
  }
  return "요청을 처리하지 못했습니다.";
}
