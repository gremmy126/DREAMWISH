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
