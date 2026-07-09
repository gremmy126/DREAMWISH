"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { ConnectorPermission } from "@/src/lib/integrations/types";

export function ConnectorPermissionList({
  permissions
}: {
  permissions: ConnectorPermission[];
}) {
  const { language } = useAppLanguage();

  return (
    <div className="space-y-2">
      {permissions.map((permission) => {
        const text = permissionText(permission.permissionKey, language);
        return (
          <div
            key={permission.permissionKey}
            className="flex items-start justify-between gap-3 rounded-2xl border border-app-border bg-white px-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-app-text">
                {text.name || permission.permissionKey}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-app-muted">
                {text.description || permission.permissionKey}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-app-border bg-app-bg px-2 py-1 text-[10px] font-semibold uppercase text-app-muted">
                {permission.riskLevel}
              </span>
              {permission.isGranted ? (
                <CheckCircle2 size={15} className="text-emerald-500" />
              ) : (
                <AlertTriangle size={15} className="text-amber-500" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function permissionText(permissionKey: string, language: string) {
  const base = permissionKey.split(".").slice(-1)[0]?.replace(/_/gu, " ") || permissionKey;
  const ko: Record<string, string> = {
    read: "읽기",
    readonly: "읽기",
    write: "쓰기",
    send: "발송",
    compose: "초안 생성",
    create: "생성",
    delete: "삭제",
    modify: "수정",
    history: "기록 읽기",
    users: "사용자 읽기",
    channels: "채널 읽기",
    repo: "저장소 읽기",
    issue: "이슈 작업",
    config: "설정 읽기",
    deploy: "배포 미리보기"
  };
  const ja: Record<string, string> = {
    read: "読み取り",
    readonly: "読み取り",
    write: "書き込み",
    send: "送信",
    compose: "下書き作成",
    create: "作成",
    delete: "削除",
    modify: "変更",
    history: "履歴読み取り",
    users: "ユーザー読み取り",
    channels: "チャンネル読み取り",
    repo: "リポジトリ読み取り",
    issue: "Issue操作",
    config: "設定読み取り",
    deploy: "デプロイプレビュー"
  };
  const normalized = Object.keys(ko).find((key) => permissionKey.includes(key));
  const name =
    language === "ko"
      ? ko[normalized || ""] || base
      : language === "ja"
        ? ja[normalized || ""] || base
        : titleCase(base);
  const description =
    language === "ko"
      ? `${permissionKey} 권한입니다. 높은 위험 권한은 승인 후에만 실행됩니다.`
      : language === "ja"
        ? `${permissionKey} 権限です。高リスク権限は承認後にのみ実行されます。`
        : `${permissionKey} permission. High-risk permissions run only after approval.`;
  return { name, description };
}

function titleCase(value: string) {
  return value.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
