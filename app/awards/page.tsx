"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WinBadge } from "@/app/components/WinBadge";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

const AWARDS_START_YEAR = 2026;
const AWARDS_START_MONTH = 7;

function getAvailableMonths(): { year: number; month: number }[] {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  const months: { year: number; month: number }[] = [];
  while (y > AWARDS_START_YEAR || (y === AWARDS_START_YEAR && m >= AWARDS_START_MONTH)) {
    months.push({ year: y, month: m });
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return months;
}

export default function AwardsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [selected, setSelected] = useState(0);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";

  const target = availableMonths[selected] ?? { year: AWARDS_START_YEAR, month: AWARDS_START_MONTH };
  const data = useQuery(api.awards.getMonthlyAwards, { year: target.year, month: target.month });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1">
            <Link
              href="/leagues"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              리그
            </Link>
            <Link
              href="/innerwars"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              내전
            </Link>
            <span className="text-sm font-semibold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
              Award
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <Link
              href="/admin"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg"
            >
              관리자 패널
            </Link>
          )}
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-800">
            프로필
          </Link>
          {currentUser && (currentUser.nickname || currentUser.name) && (
            <span className="text-sm font-medium text-gray-700">
              {currentUser.nickname && currentUser.name
                ? `${currentUser.nickname}(${currentUser.name})`
                : currentUser.nickname ?? currentUser.name}
              <WinBadge wins={currentUser.leagueWins} />
            </span>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-900">월별 우수 클랜원 시상</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {target.year}년 {target.month}월 기준 · 실시간 집계
            </p>
          </div>
          {availableMonths.length > 0 && (
            <select
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
            >
              {availableMonths.map((ym, idx) => (
                <option key={`${ym.year}-${ym.month}`} value={idx}>
                  {ym.year}년 {ym.month}월
                </option>
              ))}
            </select>
          )}
        </div>

        {data && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            산출 근거: <strong>실제로 경기를 치른 달</strong> 기준으로, <strong>리그</strong> 경기 1경기당{" "}
            {data.pointsPerLeagueGame}점, <strong>내전</strong> 경기 1경기당 {data.pointsPerInnerwarGame}점을
            부여합니다(승패 무관, 참여 경기 수 기준). 예를 들어 6월 리그라도 실제 경기를 7월에 치렀다면 7월
            집계에 포함됩니다. 전체 사용자를 대상으로 하며 경기 기록이 없으면 0점으로 표시됩니다.
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {data === undefined ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : data === null ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">로그인이 필요합니다.</div>
          ) : data.entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">대상 사용자가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-center w-10">순위</th>
                    <th className="px-4 py-3 text-left">클랜원</th>
                    <th className="px-4 py-3 text-center">리그 경기</th>
                    <th className="px-4 py-3 text-center">내전 경기</th>
                    <th className="px-4 py-3 text-center">산출근거</th>
                    <th className="px-4 py-3 text-center">점수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.entries.map((entry, idx) => {
                    const isMe = entry.userId === currentUser?._id;
                    return (
                      <tr key={entry.userId} className={isMe ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-4 py-3 text-center font-semibold text-gray-600">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/players/${entry.userId}`}
                            className={`font-medium hover:underline ${isMe ? "text-blue-700" : "text-gray-900"}`}
                          >
                            {displayName(entry.user)}
                          </Link>
                          <WinBadge wins={entry.user?.leagueWins} />
                          {isMe && <span className="ml-1 text-xs text-blue-500">(나)</span>}
                          {entry.user?.organization && (
                            <span className="ml-1 text-xs text-gray-400">{entry.user.organization}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{entry.leagueGames}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{entry.innerwarGames}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">
                          {entry.leagueGames}×{data.pointsPerLeagueGame} + {entry.innerwarGames}×{data.pointsPerInnerwarGame}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-amber-600">{entry.score}</td>
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
