"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, Suspense } from "react";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MatchesContent() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as Id<"users">;

  const currentUser = useQuery(api.users.getCurrentUser);
  const stats = useQuery(api.scores.getPlayerStats, { userId });

  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser === null) router.replace("/sign-in");
  }, [currentUser, router]);

  const matches = useMemo(() => stats?.matches ?? [], [stats]);
  const player = stats?.player;

  const availableYears = useMemo(() => {
    const years = new Set(
      matches
        .filter((m) => m.league)
        .map((m) => m.league!.year)
    );
    return Array.from(years).sort((a, b) => b - a);
  }, [matches]);

  // null = 아직 선택 안 함(최신 연도), "" = 전체
  const effectiveYear = selectedYear !== null ? selectedYear : (availableYears[0] ? String(availableYears[0]) : "");

  const filtered = useMemo(() => {
    if (!effectiveYear) return matches;
    return matches.filter((m) => m.league?.year === Number(effectiveYear));
  }, [matches, effectiveYear]);

  if (currentUser === undefined || stats === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        불러오는 중...
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        선수를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-800 text-sm font-medium"
          >
            ← 뒤로
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {displayName(player)} 전체 경기기록
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentUser && (currentUser.nickname || currentUser.name) && (
            <span className="text-sm font-medium text-gray-700">
              {currentUser.nickname && currentUser.name
                ? `${currentUser.nickname}(${currentUser.name})`
                : currentUser.nickname ?? currentUser.name}
            </span>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* 년도 필터 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            총 <span className="font-semibold text-gray-800">{filtered.length}</span>경기
          </p>
          {availableYears.length > 0 && (
            <select
              value={effectiveYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">전체</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-16 text-center text-sm text-gray-400">
            경기 기록이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {filtered.map((match) => {
                const resultLabel = match.result === "win" ? "승" : match.result === "loss" ? "패" : "무";
                const resultColor =
                  match.result === "win"
                    ? "text-green-600 bg-green-50"
                    : match.result === "loss"
                      ? "text-red-500 bg-red-50"
                      : "text-gray-500 bg-gray-100";

                return (
                  <li key={match._id} className="px-5 py-3 flex items-center gap-3">
                    <span className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${resultColor}`}>
                      {resultLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-base">
                          {match.myScore} : {match.oppScore}
                        </span>
                        <span className="text-sm text-gray-500">vs</span>
                        <Link
                          href={`/players/${match.oppId}`}
                          className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors truncate"
                        >
                          {displayName(match.opponent)}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{formatDate(match._creationTime)}</span>
                        {match.league && !match.league.deletedAt && (
                          <Link
                            href={`/leagues/${match.leagueId}`}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            {match.league.year}년 {match.league.month}월 · {match.league.name}
                          </Link>
                        )}
                        {match.league?.deletedAt && (
                          <span className="text-xs text-gray-400">
                            {match.league.year}년 {match.league.month}월 · {match.league.name} (삭제됨)
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlayerMatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
          불러오는 중...
        </div>
      }
    >
      <MatchesContent />
    </Suspense>
  );
}
