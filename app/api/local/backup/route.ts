import { NextResponse } from "next/server";
import { createLocalBackup } from "@/src/lib/backup/local-backup.service";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const result = await createLocalBackup({
      sourcePath: String(body.sourcePath || "SecondBrain"),
      targetRoot: String(body.targetRoot || "Backups")
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "로컬 백업을 만들지 못했습니다."
      },
      { status: 400 }
    );
  }
}
