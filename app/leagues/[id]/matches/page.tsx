"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

type EditingState = {
  id: Id<"scores">;
  homeScore: string;
  awayScore: string;
};

export default function MatchesPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.id as Id<"leagues">;

  const league = useQuery(api.leagues.getById, { id: leagueId });
  const currentUser = useQuery(api.users.getCurrentUser);
  const participationStatus = useQuery(api.leagues.getMyParticipationStatus, { leagueId });
  const matches = useQuery(api.scores.listAllByLeague, { leagueId });
  const updateScore = useMutation(api.scores.updateScore);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isApproved = participationStatus === "approved";

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser === undefined || participationStatus === undefined || league === undefined) return;
    if (!isManager && !isApproved) router.replace("/leagues");
  }, [currentUser, participationStatus, league, isManager, isApproved, router]);

  function startEdit(match: { _id: Id<"scores">; homeScore: number; awayScore: number }) {
    setSaveError(null);
    setEditing({ id: match._id, homeScore: String(match.homeScore), awayScore: String(match.awayScore) });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!editing) return;
    const home = parseInt(editing.homeScore, 10);
    const away = parseInt(editing.awayScore, 10);
    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      setSaveError("올바른 점수를 입력해주세요.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateScore({ scoreId: editing.id, homeScore: home, awayScore: away });
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

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
                // 7-3: 대전한 두 선수 모두 수정 가능, 관리자는 전체 가능
                const canEdit =
                  isManager ||
                  match.homeUserId === currentUser?._id ||
                  match.awayUserId === currentUser?._id;
                const isEditingThis = editing?.id === match._id;

                return (
                  <li
                    key={match._id}
                    className={`px-4 py-3 ${isMyMatch ? "bg-blue-50/50" : "hover:bg-gray-50"}`}
                  >
                    {/* 7-2: 모든 컨트롤을 한 줄로 */}
                    <div className="flex items-center gap-2">
                      {/* 홈 선수 */}
                      <Link
                        href={`/players/${match.homeUserId}`}
                        className={`flex-1 text-right text-sm font-semibold hover:opacity-70 truncate ${
                          homeWon ? "text-green-700" : draw ? "text-gray-700" : "text-gray-400"
                        }`}
                      >
                        {displayName(match.homeUser)}
                      </Link>

                      {/* 스코어 or 편집 인풋 */}
                      <div className="shrink-0 text-center min-w-[100px]">
                        {isEditingThis ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={editing.homeScore}
                              onChange={(e) =>
                                setEditing((prev) => prev ? { ...prev, homeScore: e.target.value } : prev)
                              }
                              className="w-10 rounded border border-gray-300 px-1 py-0.5 text-sm text-center outline-none focus:border-blue-500"
                            />
                            <span className="text-gray-500 font-bold text-sm">:</span>
                            <input
                              type="number"
                              min={0}
                              value={editing.awayScore}
                              onChange={(e) =>
                                setEditing((prev) => prev ? { ...prev, awayScore: e.target.value } : prev)
                              }
                              className="w-10 rounded border border-gray-300 px-1 py-0.5 text-sm text-center outline-none focus:border-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="font-bold text-gray-900 text-base leading-none">
                            {match.homeScore} : {match.awayScore}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatDate(match._creationTime)}
                        </div>
                        {isMyMatch && !isEditingThis && (
                          <div className="mt-0.5">
                            {(() => {
                              const iAmHome = match.homeUserId === currentUser?._id;
                              const myS = iAmHome ? match.homeScore : match.awayScore;
                              const oppS = iAmHome ? match.awayScore : match.homeScore;
                              if (myS > oppS) return <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">승</span>;
                              if (myS < oppS) return <span className="text-xs font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">패</span>;
                              return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">무</span>;
                            })()}
                          </div>
                        )}
                      </div>

                      {/* 어웨이 선수 */}
                      <Link
                        href={`/players/${match.awayUserId}`}
                        className={`flex-1 text-left text-sm font-semibold hover:opacity-70 truncate ${
                          awayWon ? "text-green-700" : draw ? "text-gray-700" : "text-gray-400"
                        }`}
                      >
                        {displayName(match.awayUser)}
                      </Link>

                      {/* 수정/취소/저장 버튼 — 한 줄 */}
                      <div className="shrink-0 flex items-center gap-1">
                        {canEdit && (
                          isEditingThis ? (
                            <>
                              <button
                                onClick={cancelEdit}
                                className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                              >
                                취소
                              </button>
                              <button
                                onClick={handleSave}
                                disabled={saving}
                                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {saving ? "..." : "저장"}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEdit(match)}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                            >
                              수정
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* 저장 오류 메시지 */}
                    {isEditingThis && saveError && (
                      <p className="text-xs text-red-500 text-right mt-1">{saveError}</p>
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
