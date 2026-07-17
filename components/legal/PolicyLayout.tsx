import Link from "next/link";
import type { ReactNode } from "react";
import {
  OPERATOR_INFO,
  POLICY_EFFECTIVE_DATE,
  POLICY_LAST_UPDATED,
  POLICY_LINKS
} from "@/src/lib/legal/policy";

export function PolicyLayout({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-app-bg px-4 py-10 text-app-text sm:px-6">
      <article className="mx-auto max-w-4xl rounded-app border border-app-border bg-app-card p-6 shadow-app sm:p-8">
        <Link className="text-sm font-semibold text-app-primary" href="/">
          DREAMWISH
        </Link>
        <header className="mt-5 border-b border-app-border pb-7">
          <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-app-muted">{description}</p>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-app-muted">
            <div className="flex gap-2">
              <dt className="font-semibold text-app-text">시행일</dt>
              <dd>{POLICY_EFFECTIVE_DATE}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-app-text">최종 업데이트</dt>
              <dd>{POLICY_LAST_UPDATED}</dd>
            </div>
          </dl>
        </header>

        <div className="mt-8 space-y-9 text-sm leading-7 text-app-text">{children}</div>

        <section className="mt-10 rounded-app border border-app-border bg-app-bg p-5" aria-labelledby="operator-information">
          <h2 id="operator-information" className="text-lg font-semibold text-app-text">
            사업자 및 문의 정보
          </h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <OperatorField label="상호" value={OPERATOR_INFO.businessName} />
            <OperatorField label="대표자" value={OPERATOR_INFO.representative} />
            <OperatorField label="사업자등록번호" value={OPERATOR_INFO.businessRegistrationNumber} />
            <OperatorField label="통신판매업 신고번호" value={OPERATOR_INFO.mailOrderRegistrationNumber} />
            <OperatorField label="사업장 주소" value={OPERATOR_INFO.address} wide />
            <OperatorField label="전화" value={OPERATOR_INFO.phone} href={`tel:${OPERATOR_INFO.phone}`} />
            <OperatorField label="이메일" value={OPERATOR_INFO.email} href={`mailto:${OPERATOR_INFO.email}`} />
          </dl>
        </section>

        <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-3 border-t border-app-border pt-5 text-sm" aria-label="정책 문서">
          {POLICY_LINKS.map((link) => (
            <Link key={link.href} className="font-semibold text-app-primary transition hover:text-app-text" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}

export function PolicySection({
  id,
  title,
  children
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-app-text">{title}</h2>
      <div className="mt-3 space-y-3 text-app-muted [&_a]:font-semibold [&_a]:text-app-primary [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-app-text [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-app-border [&_td]:p-3 [&_th]:border [&_th]:border-app-border [&_th]:bg-app-bg [&_th]:p-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-app-text">
        {children}
      </div>
    </section>
  );
}

function OperatorField({
  label,
  value,
  href,
  wide = false
}: {
  label: string;
  value: string;
  href?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold text-app-muted">{label}</dt>
      <dd className="mt-1 font-medium text-app-text">
        {href ? <a className="hover:text-app-primary" href={href}>{value}</a> : value}
      </dd>
    </div>
  );
}
