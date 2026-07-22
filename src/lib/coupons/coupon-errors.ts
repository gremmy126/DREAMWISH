// 쿠폰 도메인 오류를 타입으로 구분해 API가 올바른 HTTP 상태 코드를 돌려줄
// 수 있게 한다. 값 검증 실패(400)와 코드 중복(409)을 인증·권한 오류(401/403)와
// 뒤섞지 않는 것이 핵심이다.

export class CouponValidationError extends Error {
  readonly status = 400 as const;
  readonly code = "COUPON_VALIDATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "CouponValidationError";
  }
}

export class CouponConflictError extends Error {
  readonly status = 409 as const;
  readonly code = "COUPON_CODE_DUPLICATE" as const;

  constructor(message = "이미 존재하는 쿠폰 코드입니다.") {
    super(message);
    this.name = "CouponConflictError";
  }
}
