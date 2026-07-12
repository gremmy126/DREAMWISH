import assert from "node:assert/strict";
import fs from "node:fs";

test("login form validation distinguishes empty malformed and valid input", () => {
  assert.equal(fs.existsSync("src/lib/auth/login-form-validation.ts"), true);
  const { validateLoginForm, validatePasswordResetEmail } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    validateLoginForm: (input: {
      email: string;
      password: string;
      mode: "signin" | "signup";
    }) => { email?: string; password?: string };
    validatePasswordResetEmail: (email: string) => string | null;
  };

  assert.deepEqual(validateLoginForm({ email: "", password: "", mode: "signin" }), {
    email: "이메일을 입력해주세요.",
    password: "비밀번호를 입력해주세요."
  });
  assert.deepEqual(
    validateLoginForm({ email: "wrong-address", password: "secret1", mode: "signin" }),
    { email: "올바른 이메일 주소를 입력해주세요." }
  );
  assert.deepEqual(
    validateLoginForm({ email: " name@example.com ", password: "secret1", mode: "signin" }),
    {}
  );
  assert.deepEqual(
    validateLoginForm({ email: "name@example.com", password: "12345", mode: "signup" }),
    { password: "비밀번호는 6자 이상이어야 합니다." }
  );
  assert.equal(validatePasswordResetEmail(""), "비밀번호를 재설정할 이메일을 입력해주세요.");
  assert.equal(
    validatePasswordResetEmail("wrong-address"),
    "올바른 이메일 주소를 입력해주세요."
  );
  assert.equal(validatePasswordResetEmail(" name@example.com "), null);
});

test("login shell provides the approved responsive accessible SaaS layout", () => {
  assert.equal(fs.existsSync("components/auth/LoginShell.tsx"), true);
  const source = fs.readFileSync("components/auth/LoginShell.tsx", "utf8");

  for (const contract of [
    /lg:grid-cols-\[55fr_45fr\]/u,
    /max-w-\[440px\]/u,
    /당신의 지식과 업무를 하나로 연결하세요/u,
    /다시 오신 것을 환영합니다/u,
    /계정에 로그인하고 작업을 계속하세요/u,
    /<form/u,
    /onSubmit=/u,
    /id="email"/u,
    /name="email"/u,
    /type="email"/u,
    /autoComplete="email"/u,
    /placeholder="name@example.com"/u,
    /id="password"/u,
    /name="password"/u,
    /autoComplete=\{creatingAccount \? "new-password" : "current-password"\}/u,
    /aria-invalid/u,
    /aria-describedby/u,
    /role="alert"/u,
    /aria-live="polite"/u,
    /Google로 계속하기/u,
    /GitHub로 계속하기/u,
    /안전하게 보호됩니다/u,
    /useReducedMotion/u,
    /motion\./u
  ]) {
    assert.match(source, contract);
  }

  for (const icon of ["Mail", "LockKeyhole", "Network", "CalendarCheck", "ShieldCheck"]) {
    assert.match(source, new RegExp(`\\b${icon}\\b`, "u"));
  }
});
