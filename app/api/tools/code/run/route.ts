import vm from "node:vm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const code = String(body.code || "");

  if (!code.trim()) {
    return NextResponse.json({ error: "실행할 코드를 입력해주세요." }, { status: 400 });
  }

  if (code.length > 6000) {
    return NextResponse.json(
      { error: "코드가 너무 깁니다. 6000자 이하로 줄여주세요." },
      { status: 400 }
    );
  }

  const logs: string[] = [];
  const sandbox = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      warn: (...args: unknown[]) => logs.push(args.map(String).join(" "))
    },
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set
  };

  try {
    const result = vm.runInNewContext(code, sandbox, {
      timeout: 1000,
      displayErrors: true
    });

    return NextResponse.json({
      result: result === undefined ? null : String(result),
      logs
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "코드 실행 중 오류가 발생했습니다.",
        logs
      },
      { status: 400 }
    );
  }
}
