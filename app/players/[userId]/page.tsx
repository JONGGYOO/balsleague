"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { WinBadge } from "@/app/components/WinBadge";

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

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex-1 text-center">
      <div className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

type StatLike = { games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDiff: number };

function StatRow({ stat }: { stat: StatLike }) {
  return (
    <div className="space-y-2">
      <div className="flex divide-x divide-gray-100">
        <StatBox label="경기" value={stat.games} />
        <StatBox label="승" value={stat.wins} color="text-green-600" />
        <StatBox label="무" value={stat.draws} color="text-gray-500" />
        <StatBox label="패" value={stat.losses} color="text-red-500" />
        <StatBox
          label="득실"
          value={stat.goalDiff > 0 ? `+${stat.goalDiff}` : stat.goalDiff}
          color={stat.goalDiff > 0 ? "text-green-600" : stat.goalDiff < 0 ? "text-red-500" : "text-gray-600"}
        />
      </div>
      {stat.games > 0 && (
        <div className="px-1">
          <div className="flex rounded-full overflow-hidden h-2 bg-gray-100">
            {stat.wins > 0 && (
              <div className="bg-green-500 h-full" style={{ width: `${(stat.wins / stat.games) * 100}%` }} />
            )}
            {stat.draws > 0 && (
              <div className="bg-gray-300 h-full" style={{ width: `${(stat.draws / stat.games) * 100}%` }} />
            )}
            {stat.losses > 0 && (
              <div className="bg-red-400 h-full" style={{ width: `${(stat.losses / stat.games) * 100}%` }} />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>승률 {Math.round((stat.wins / stat.games) * 100)}%</span>
            <span>{stat.goalsFor}득 {stat.goalsAgainst}실</span>
          </div>
        </div>
      )}
    </div>
  );
}

type VsStatLike = { games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDiff: number };

function VsStatRow({ vs }: { vs: VsStatLike }) {
  if (vs.games === 0) return <p className="text-sm text-gray-400">전적 없음</p>;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-bold text-green-600">{vs.wins}승</span>
      <span className="text-sm text-gray-400">{vs.draws}무</span>
      <span className="text-sm font-bold text-red-500">{vs.losses}패</span>
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
        vs.goalDiff > 0 ? "text-green-700 bg-green-50" : vs.goalDiff < 0 ? "text-red-600 bg-red-50" : "text-gray-500 bg-gray-100"
      }`}>
        득실 {vs.goalDiff > 0 ? `+${vs.goalDiff}` : vs.goalDiff}
      </span>
      <span className="text-xs text-gray-400">{vs.goalsFor}득 {vs.goalsAgainst}실</span>
    </div>
  );
}

function PlayerStatsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = params.userId as Id<"users">;
  const leagueIdParam = searchParams.get("league");
  const leagueId = (leagueIdParam ?? undefined) as Id<"leagues"> | undefined;

  const currentUser = useQuery(api.users.getCurrentUser);
  const stats = useQuery(api.scores.getPlayerStats, { userId, leagueId });
  const leagueParticipants = useQuery(
    api.leagues.getParticipants,
    leagueId ? { leagueId } : "skip"
  );
  const [showUnplayed, setShowUnplayed] = useState(false);

  const unplayedParticipants = useMemo(() => {
    if (!leagueParticipants || !stats || !leagueId) return [];
    const currentMatches = stats.matches.filter((m) => m.leagueId === leagueId);
    const playedIds = new Set(currentMatches.map((m) => m.oppId));
    return leagueParticipants.filter(
      (p) => p.userId !== userId && !playedIds.has(p.userId)
    );
  }, [leagueParticipants, stats, userId, leagueId]);

  useEffect(() => {
    if (currentUser === null) router.replace("/sign-in");
  }, [currentUser, router]);

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

  const { player, currentLeagueStats, overall, vsViewer, matches } = stats;
  const isMe = userId === currentUser?._id;

  const currentLeagueMatches = leagueId
    ? matches.filter((m) => m.leagueId === leagueId)
    : [];

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
          <h1 className="text-xl font-bold text-gray-900">선수 상세</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
        {/* 선수 프로필 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 shrink-0">
              {(player.nickname ?? player.name ?? "?")[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {displayName(player)}
                <WinBadge wins={player.leagueWins} />
                {isMe && <span className="ml-1 text-sm font-normal text-blue-500">(나)</span>}
              </h2>
              {player.nickname && player.name && (
                <p className="text-sm text-gray-500">{player.name}</p>
              )}
              {player.organization && (
                <p className="text-sm text-gray-400">{player.organization}</p>
              )}
            </div>
          </div>
        </div>

        {/* 1. 현재 리그 통계 */}
        {currentLeagueStats && (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-50 bg-blue-50">
              <h3 className="text-sm font-semibold text-blue-700">현재 리그 통계</h3>
            </div>
            <div className="px-4 py-4">
              {currentLeagueStats.games === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">이 리그에 경기 기록이 없습니다.</p>
              ) : (
                <StatRow stat={currentLeagueStats} />
              )}
            </div>
          </div>
        )}

        {/* 2. 상대전적 현재 리그 */}
        {vsViewer && vsViewer.currentLeague && leagueId && (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-50 bg-blue-50">
              <h3 className="text-sm font-semibold text-blue-700">
                상대전적 현재리그
                <span className="ml-1 font-normal text-blue-500">
                  {displayName(player)} vs {displayName(vsViewer.viewer)}
                </span>
              </h3>
            </div>
            <div className="px-5 py-4">
              <VsStatRow vs={vsViewer.currentLeague} />
            </div>
          </div>
        )}

        {/* 3. 경기 기록 현재 리그 */}
        {leagueId && (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-50 bg-blue-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blue-700">경기 기록 현재리그</h3>
              <span className="text-xs text-blue-500">{currentLeagueMatches.length}경기</span>
            </div>
            {currentLeagueMatches.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                이 리그의 경기 기록이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {currentLeagueMatches.map((match) => {
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
                            href={`/players/${match.oppId}?league=${leagueId}`}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors truncate"
                          >
                            {displayName(match.opponent)}
                            <WinBadge wins={match.opponent?.leagueWins} />
                          </Link>
                        </div>
                        <span className="text-xs text-gray-400">{formatDate(match._creationTime)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 3.5 아직 대결 안 한 참가자 (현재 리그) */}
        {leagueId && (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 flex items-center gap-3">
              <button
                onClick={() => setShowUnplayed((v) => !v)}
                className="text-sm font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1"
              >
                아직 대결 안 한 참가자 {unplayedParticipants.length}명
                <span className="text-xs">{showUnplayed ? "▲" : "▼"}</span>
              </button>
            </div>
            {showUnplayed && (
              <div className="border-t border-blue-50 px-5 py-3">
                {leagueParticipants === undefined ? (
                  <p className="text-sm text-gray-400">불러오는 중...</p>
                ) : unplayedParticipants.length === 0 ? (
                  <p className="text-sm text-gray-400">모든 참가자와 대결했습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {unplayedParticipants.map((p) => (
                      <li key={p._id} className="flex items-center gap-2 text-sm">
                        <Link
                          href={`/players/${p.userId}?league=${leagueId}`}
                          className="font-medium text-gray-800 hover:underline"
                        >
                          {displayName(p.user)}
                        </Link>
                        <WinBadge wins={p.user?.leagueWins} />
                        {p.user?.organization && (
                          <span className="text-xs text-gray-400">{p.user.organization}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. 전체 통계 (모든 리그) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">전체 통계 (모든 리그)</h3>
          </div>
          <div className="px-4 py-4">
            {overall.games === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">경기 기록이 없습니다.</p>
            ) : (
              <StatRow stat={overall} />
            )}
          </div>
        </div>

        {/* 5. 상대전적 전체리그 */}
        {vsViewer && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">
                상대전적 전체리그
                <span className="ml-1 font-normal text-gray-400">
                  {displayName(player)} vs {displayName(vsViewer.viewer)}
                </span>
              </h3>
            </div>
            <div className="px-5 py-4">
              <VsStatRow vs={vsViewer.allLeagues} />
            </div>
          </div>
        )}

        {/* 6. 경기기록 전체리그 (최근 5경기, 전체보기 링크) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">경기기록 전체리그</h3>
            <Link
              href={`/players/${userId}/matches`}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              전체보기 →
            </Link>
          </div>
          {matches.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              경기 기록이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {matches.slice(0, 5).map((match) => {
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
                          <WinBadge wins={match.opponent?.leagueWins} />
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
          )}
        </div>
      </main>
    </div>
  );
}

export default function PlayerStatsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
          불러오는 중...
        </div>
      }
    >
      <PlayerStatsContent />
    </Suspense>
  );
}
