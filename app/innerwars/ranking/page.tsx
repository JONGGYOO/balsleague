"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WinBadge } from "@/app/components/WinBadge";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

function InnerwarRankingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;

  const currentUser = useQuery(api.users.getCurrentUser);
  const data = useQuery(api.innerwars.getInnerwarYearlyStandings, { year });

  function handleYearChange(value: string) {
    router.push(value ? `/innerwars/ranking?year=${value}` : "/innerwars/ranking");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/innerwars"
            className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
          >
            ← 내전 목록
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {year ? `${year}년 내전 전체 순위` : "전체 내전 순위"}
          </h2>
          {data && data.availableYears.length > 0 && (
            <select
              value={year ?? ""}
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">전체</option>
              {data.availableYears.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {data === undefined ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : data === null ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">로그인이 필요합니다.</div>
          ) : data.standings.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">완료된 경기 기록이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500">
                    <th className="px-2 py-3 text-center w-8">순위</th>
                    <th className="px-2 py-3 text-left">선수</th>
                    <th className="px-2 py-3 text-center">개인전적</th>
                    <th className="px-2 py-3 text-center">팀전적</th>
                    <th className="px-2 py-3 text-center">승패율(%)</th>
                    <th className="px-2 py-3 text-center">버스력(%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.standings.map((entry, idx) => {
                    const isMe = entry.userId === currentUser?._id;
                    return (
                      <tr key={entry.userId} className={isMe ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-2 py-3 text-center font-semibold text-gray-600">{idx + 1}</td>
                        <td className="px-2 py-3">
                          <Link
                            href={`/players/${entry.userId}/innerwar`}
                            className={`font-medium hover:underline ${isMe ? "text-blue-700" : "text-gray-900"}`}
                          >
                            {displayName(entry.user)}
                          </Link>
                          <WinBadge wins={entry.user?.leagueWins} />
                          {isMe && <span className="ml-1 text-xs text-blue-500">(나)</span>}
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <div className="font-bold text-blue-700">{entry.points}점</div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            <span className="text-green-600">{entry.wins}승</span>{" "}
                            {entry.draws}무{" "}
                            <span className="text-red-500">{entry.losses}패</span>
                            <span className="text-gray-400"> · {entry.games}전</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <div className="font-semibold">
                            <span className="text-green-600">{entry.innerwarWins}승</span>{" "}
                            <span className="text-red-500">{entry.innerwarLosses}패</span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">{entry.innerwarsPlayed}참여</div>
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <span className="text-green-600">{entry.winRate}</span>
                          <span className="text-gray-400">, </span>
                          <span className="text-red-500">{entry.lossRate}</span>
                        </td>
                        <td
                          className={`px-2 py-3 text-center font-semibold whitespace-nowrap ${
                            entry.busPower > 0
                              ? "text-amber-600"
                              : entry.busPower < 0
                                ? "text-blue-500"
                                : "text-gray-400"
                          }`}
                        >
                          {entry.busPower > 0 ? `+${entry.busPower}` : entry.busPower}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function InnerwarRankingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
          불러오는 중...
        </div>
      }
    >
      <InnerwarRankingContent />
    </Suspense>
  );
}
