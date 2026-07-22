// Schema.org JSON-LD를 서버 렌더링 HTML에 직접 삽입한다. next/script는
// 클라이언트 로더를 거치므로 JS 실행 없이 크롤러가 읽을 수 없다.
// <, >, & 는 JSON 이스케이프(< 등)로 치환되므로 React의 텍스트
// 이스케이프와 무관하게 항상 유효한 JSON이 출력된다.
export function JsonLd({ id, data }: { id: string; data: unknown }) {
  const json = JSON.stringify(data)
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026");
  return (
    <script id={id} type="application/ld+json" suppressHydrationWarning>
      {json}
    </script>
  );
}
