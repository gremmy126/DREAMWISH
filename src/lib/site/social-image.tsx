import { ImageResponse } from "next/og";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

export function renderSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "88px",
          color: "white",
          background:
            "radial-gradient(circle at 82% 18%, #60a5fa 0, #7c3aed 28%, #111827 72%)"
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 5 }}>
          DREAMWISH
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 900,
            marginTop: 44,
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: -3
          }}
        >
          나의 기억과 업무를 이어가는 개인두뇌 AI
        </div>
        <div style={{ display: "flex", marginTop: 34, fontSize: 28, color: "#dbeafe" }}>
          로그인 후 나만의 AI 채팅을 바로 시작하세요
        </div>
      </div>
    ),
    SOCIAL_IMAGE_SIZE
  );
}
