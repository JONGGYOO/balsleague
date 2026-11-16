import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "e풋볼 특수 기술 도감 | 발스리그",
  description:
    "e풋볼 특수 기술 21종의 발동 조건·수치와 99 상한·컨디션·경기장 구역·중첩 규칙 정리",
};

/**
 * e풋볼 특수 기술 도감 페이지 (게시판 목록에서 진입).
 * 본문은 public/efootball-skills.html(독립 HTML)이며, iframe으로 표시한다.
 * 도감 내부의 탭·상세 패널·계산기는 iframe 안에서 그대로 동작한다.
 */
export default function EfootballSkillsPage() {
  return (
    <div className="flex h-dvh w-full flex-col bg-gray-50">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <Link
          href="/boards"
          className="rounded-full px-3 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          ← 게시판
        </Link>
        <h1 className="truncate text-base font-semibold text-gray-900">⚽ 특수 기술 매커니즘</h1>
      </header>
      <iframe
        src="/efootball-skills.html"
        title="e풋볼 특수 기술 도감"
        className="w-full flex-1 border-0"
      />
    </div>
  );
}
