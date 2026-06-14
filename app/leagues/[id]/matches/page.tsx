"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

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

export default function MatchesPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.id as Id<"leagues">;

  const league = useQuery(api.leagues.getById, { id: leagueId });
  const currentUser = useQuery(api.users.getCurrentUser);
  const participationStatus = useQuery(api.leagues.getMyParticipationStatus, { leagueId });
  const matches = useQuery(api.scores.listAllByLeague, { leagueId });

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isApproved = participationStatus === "approved";

  // 접근 제어
  useEffect(() => {
    if (currentUser === undefined || participationStatus === undefined || league === undefined) return;
    if (!isManager && !isApproved) router.replace("/leagues");
  }, [currentUser, participationStatus, league, isManager, isApproved, router]);

  if (league === undefined || currentUser === undefined || participationStatus === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        불러오는 중...
      </div>
    );
  }

  if (league === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        리그를 찾을 수 없습니다.
      </div>
    );
  }

  if (!isManager && !isApproved) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/leagues/${leagueId}`}
            className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0"
          >
            ← 순위표
          </Link>
          <h1 className="text-xl font-bold text-gray-900 truncate">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2 py-0.5 mr-2">
              {league.year}년 {league.month}월
            </span>
            {league.name} · 경기 결과
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            전체 경기 결과
            {matches && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {matches.length}경기
              </span>
            )}
          </h2>
        </div>

        {matches === undefined ? (
          <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">⚽</p>
            <p className="text-sm font-medium">아직 입력된 경기 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {matches.map((match) => {
                const homeWon = match.homeScore > match.awayScore;
                const awayWon = match.awayScore > match.homeScore;
                const draw = match.homeScore === match.awayScore;
                const isMyMatch =
                  match.homeUserId === currentUser?._id ||
                  match.awayUserId === currentUser?._id;

                return (
                  <li
                    key={match._id}
                    className={`px-5 py-4 ${isMyMatch ? "bg-blue-50/50" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* 홈 선수 */}
                      <Link
                        href={`/players/${match.homeUserId}`}
                        className={`flex-1 text-right text-sm font-semibold transition-opacity hover:opacity-70 ${
                          homeWon
                            ? "text-green-700"
                            : draw
                              ? "text-gray-700"
                              : "text-gray-400"
                        }`}
                      >
                        {displayName(match.homeUser)}
                      </Link>

                      {/* 스코어 */}
                      <div className="shrink-0 text-center px-3">
                        <div className="font-bold text-gray-900 text-lg leading-none">
                          {match.homeScore} : {match.awayScore}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatDate(match._creationTime)}
                        </div>
                      </div>

                      {/* 어웨이 선수 */}
                      <Link
                        href={`/players/${match.awayUserId}`}
                        className={`flex-1 text-left text-sm font-semibold transition-opacity hover:opacity-70 ${
                          awayWon
                            ? "text-green-700"
                            : draw
                              ? "text-gray-700"
                              : "text-gray-400"
                        }`}
                      >
                        {displayName(match.awayUser)}
                      </Link>
                    </div>

                    {/* 결과 배지 (내 경기인 경우) */}
                    {isMyMatch && (
                      <div className="mt-1.5 flex justify-center">
                        {(() => {
                          const iAmHome = match.homeUserId === currentUser?._id;
                          const myS = iAmHome ? match.homeScore : match.awayScore;
                          const oppS = iAmHome ? match.awayScore : match.homeScore;
                          if (myS > oppS) return <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">승</span>;
                          if (myS < oppS) return <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">패</span>;
                          return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">무</span>;
                        })()}
                      </div>
                    )}
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
