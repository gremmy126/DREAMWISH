import { mkdir, stat, cp } from "node:fs/promises";
import path from "node:path";

export type LocalBackupInput = {
  sourcePath: string;
  targetRoot: string;
};

export type LocalBackupResult = {
  sourcePath: string;
  backupPath: string;
  createdAt: string;
};

export async function createLocalBackup({
  sourcePath,
  targetRoot
}: LocalBackupInput): Promise<LocalBackupResult> {
  const cwd = process.cwd();
  const resolvedSource = resolveInsideWorkspace(sourcePath || "SecondBrain", cwd);
  const resolvedTargetRoot = resolveInsideWorkspace(targetRoot || "Backups", cwd);
  const sourceStat = await stat(resolvedSource);

  if (!sourceStat.isDirectory()) {
    throw new Error("백업 대상은 폴더여야 합니다.");
  }

  const relativeTarget = path.relative(resolvedSource, resolvedTargetRoot);
  if (!relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget)) {
    throw new Error("백업 폴더는 원본 폴더 안에 둘 수 없습니다.");
  }

  const createdAt = new Date().toISOString();
  const folderName = `${path.basename(resolvedSource)}-${formatTimestamp(createdAt)}`;
  const backupPath = path.join(resolvedTargetRoot, folderName);

  await mkdir(resolvedTargetRoot, { recursive: true });
  await cp(resolvedSource, backupPath, {
    recursive: true,
    errorOnExist: true,
    force: false
  });

  return {
    sourcePath: resolvedSource,
    backupPath,
    createdAt
  };
}

function resolveInsideWorkspace(inputPath: string, cwd: string) {
  const resolved = path.resolve(cwd, inputPath);
  const relative = path.relative(cwd, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("현재 앱 폴더 안의 경로만 사용할 수 있습니다.");
  }

  return resolved;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}
