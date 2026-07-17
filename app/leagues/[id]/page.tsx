"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useMemo } from "react";
import { WinBadge } from "@/app/components/WinBadge";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.id as Id<"leagues">;

  const league = useQuery(api.leagues.getById, { id: leagueId });
  const currentUser = useQuery(api.users.getCurrentUser);
  const participationStatus = useQuery(api.leagues.getMyParticipationStatus, { leagueId });
  const participants = useQuery(api.leagues.getParticipants, { leagueId });
  const standings = useQuery(api.scores.getStandings, { leagueId });
  const recentMatches = useQuery(api.scores.listByLeague, { leagueId });

  const addScore = useMutation(api.scores.add);
  const updateScore = useMutation(api.scores.updateScore);
  const deleteScore = useMutation(api.scores.remove);
  const endLeague = useMutation(api.leagues.endLeague);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isApproved = participationStatus === "approved";
  const isEnded = league?.status === "ended";
  // 승인된 참가자만 스코어 입력 가능. 종료된 리그는 관리자만 계속 입력/수정 가능
  const canEnterScore = isApproved && (!isEnded || isManager);
  const [ending, setEnding] = useState(false);

  async function handleEndLeague() {
    if (!confirm("리그를 종료할까요?\n순위가 확정되고 1위 참가자에게 우승 기록이 부여됩니다.\n(종료 후에도 관리자는 기록을 수정할 수 있습니다)")) return;
    setEnding(true);
    try {
      await endLeague({ id: leagueId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setEnding(false);
    }
  }

  // 접근 제어: 일반 사용자는 승인된 참가자만 접근 가능
  useEffect(() => {
    if (
      currentUser === undefined ||
      participationStatus === undefined ||
      league === undefined
    )
      return;

    if (!isManager && !isApproved) {
      router.replace("/leagues");
    }
  }, [currentUser, participationStatus, league, isManager, isApproved, router]);

  // Score input state
  const [showParticipants, setShowParticipants] = useState(false);
  const [opponentSearch, setOpponentSearch] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<{
    userId: Id<"users">;
    name: string;
  } | null>(null);
  const [myScore, setMyScore] = useState<string>("0");
  const [opponentScore, setOpponentScore] = useState<string>("0");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // 최근 경기 수정 상태
  const [editingMatch, setEditingMatch] = useState<{
    id: Id<"scores">;
    homeScore: string;
    awayScore: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"scores"> | null>(null);

  const hasDuplicate = useQuery(
    api.scores.checkDuplicate,
    selectedOpponent ? { leagueId, opponentUserId: selectedOpponent.userId } : "skip"
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredParticipants = useMemo(() => {
    if (!participants || !currentUser) return [];
    const others = participants.filter((p) => p.userId !== currentUser._id);
    if (!opponentSearch.trim()) return others;
    const q = opponentSearch.toLowerCase();
    return others.filter((p) => {
      const name = (p.user?.name ?? "").toLowerCase();
      const nick = (p.user?.nickname ?? "").toLowerCase();
      return name.includes(q) || nick.includes(q);
    });
  }, [participants, currentUser, opponentSearch]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current !== e.target
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectOpponent(p: {
    userId: Id<"users">;
    user?: { name?: string; nickname?: string } | null;
  }) {
    setSelectedOpponent({ userId: p.userId, name: displayName(p.user) });
    setOpponentSearch("");
    setDropdownOpen(false);
    setShowDuplicateWarning(false);
  }

  async function doSubmit(my: number, opp: number) {
    if (!selectedOpponent) return;
    setSubmitting(true);
    setSubmitError(null);
    setShowDuplicateWarning(false);
    try {
      await addScore({
        leagueId,
        opponentUserId: selectedOpponent.userId,
        myScore: my,
        opponentScore: opp,
      });
      setSelectedOpponent(null);
      setMyScore("0");
      setOpponentScore("0");
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleScoreSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOpponent) return;
    const my = parseInt(myScore, 10);
    const opp = parseInt(opponentScore, 10);
    if (isNaN(my) || isNaN(opp) || my < 0 || opp < 0) return;

    if (hasDuplicate) {
      setShowDuplicateWarning(true);
      return;
    }
    await doSubmit(my, opp);
  }

  async function handleMatchEditSave() {
    if (!editingMatch) return;
    const home = parseInt(editingMatch.homeScore, 10);
    const away = parseInt(editingMatch.awayScore, 10);
    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      setEditError("올바른 점수를 입력해주세요.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateScore({ scoreId: editingMatch.id, homeScore: home, awayScore: away });
      setEditingMatch(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleMatchDelete(scoreId: Id<"scores">) {
    if (!window.confirm("이 경기 기록을 삭제하시겠습니까?")) return;
    setDeletingId(scoreId);
    setEditError(null);
    try {
      await deleteScore({ scoreId });
      setEditingMatch(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  // 로딩 중
  if (
    league === undefined ||
    currentUser === undefined ||
    participationStatus === undefined
  ) {
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

  // 접근 불가 (redirect 중)
  if (!isManager && !isApproved) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/leagues" className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0">
            ← 목록
          </Link>
          <h1 className="text-xl font-bold text-gray-900 truncate">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2 py-0.5 mr-2">
              {league.year}년 {league.month}월
            </span>
            {league.name}
            {isEnded && (
              <span className="ml-2 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 align-middle">
                종료됨
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
          {isManager && (
            <Link href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              관리자 패널
            </Link>
          )}
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

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 리그 관리 (종료) */}
        {isManager && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">리그 관리</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEnded
                  ? "이 리그는 종료되어 순위가 확정되었습니다. 관리자는 계속 기록을 수정할 수 있습니다."
                  : "종료하면 순위가 확정되고 1위 참가자에게 우승 기록이 부여됩니다."}
              </p>
            </div>
            {isEnded ? (
              <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-1.5">
                종료됨
              </span>
            ) : (
              <button
                onClick={handleEndLeague}
                disabled={ending}
                className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {ending ? "종료 중..." : "리그 종료"}
              </button>
            )}
          </div>
        )}

        {/* 참가자 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-3 text-sm text-gray-600">
            <button
              onClick={() => setShowParticipants((v) => !v)}
              className="font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              참가자 {participants?.length ?? 0}명
              <span className="text-xs">{showParticipants ? "▲" : "▼"}</span>
            </button>
            {isApproved && (
              <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                참가 중
              </span>
            )}
            {isManager && !isApproved && (
              <span className="text-indigo-600 text-xs">
                (스코어 입력은 목록 페이지에서 참가 신청 후 가능합니다)
              </span>
            )}
          </div>
          {showParticipants && (
            <div className="border-t border-gray-100 px-5 py-3">
              {!participants || participants.length === 0 ? (
                <p className="text-sm text-gray-400">참가자가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {participants.map((p) => (
                    <li key={p._id} className="flex items-center gap-2 text-sm">
                      <Link
                        href={`/players/${p.userId}`}
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

        {/* 스코어 입력 */}
        {canEnterScore && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">스코어 입력</h2>
            <form onSubmit={handleScoreSubmit} className="space-y-4">
              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-gray-700">상대 선수</label>
                {selectedOpponent ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg border border-blue-400 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                      {selectedOpponent.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedOpponent(null)}
                      className="text-gray-400 hover:text-gray-600 text-sm px-2"
                    >
                      변경
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={searchRef}
                      type="text"
                      value={opponentSearch}
                      onChange={(e) => { setOpponentSearch(e.target.value); setDropdownOpen(true); }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder="이름 또는 닉네임 검색..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoComplete="off"
                    />
                    {dropdownOpen && filteredParticipants.length > 0 && (
                      <div
                        ref={dropdownRef}
                        className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto"
                      >
                        {filteredParticipants.map((p) => (
                          <button
                            key={p._id}
                            type="button"
                            onMouseDown={() => selectOpponent(p)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className="font-medium text-gray-900">
                              {p.user?.nickname ?? p.user?.name ?? "이름 없음"}
                            </span>
                            {p.user?.nickname && p.user?.name && (
                              <span className="text-xs text-gray-400">({p.user.name})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {dropdownOpen && opponentSearch && filteredParticipants.length === 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2.5 text-sm text-gray-400">
                        일치하는 참가자가 없습니다
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    내 점수
                    {currentUser && (
                      <span className="ml-1 text-xs text-gray-400">({displayName(currentUser)})</span>
                    )}
                  </label>
                  <input
                    type="number" min={0} value={myScore}
                    onChange={(e) => setMyScore(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <span className="text-gray-400 font-bold mt-5">:</span>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    상대 점수
                    {selectedOpponent && (
                      <span className="ml-1 text-xs text-gray-400">({selectedOpponent.name})</span>
                    )}
                  </label>
                  <input
                    type="number" min={0} value={opponentScore}
                    onChange={(e) => setOpponentScore(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {submitError && <p className="text-xs text-red-500">{submitError}</p>}
              {submitSuccess && <p className="text-xs text-green-600">스코어가 입력되었습니다!</p>}

              {showDuplicateWarning && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800">
                    이미 경기를 했습니다. 추가로 입력하겠습니까?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDuplicateWarning(false)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        const my = parseInt(myScore, 10);
                        const opp = parseInt(opponentScore, 10);
                        if (!isNaN(my) && !isNaN(opp)) doSubmit(my, opp);
                      }}
                      className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      {submitting ? "입력 중..." : "추가 입력"}
                    </button>
                  </div>
                </div>
              )}

              {!showDuplicateWarning && (
                <button
                  type="submit"
                  disabled={submitting || !selectedOpponent}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "입력 중..." : "스코어 입력"}
                </button>
              )}
            </form>
          </div>
        )}

        {/* 순위표 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">순위표</h2>
          </div>
          {standings === undefined ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : standings.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">참가자가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-center w-8">순위</th>
                    <th className="px-4 py-3 text-left">선수</th>
                    <th className="px-4 py-3 text-center">경기</th>
                    <th className="px-4 py-3 text-center">승</th>
                    <th className="px-4 py-3 text-center">무</th>
                    <th className="px-4 py-3 text-center">패</th>
                    <th className="px-4 py-3 text-center">득실</th>
                    <th className="px-4 py-3 text-center">승점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {standings.map((entry, idx) => {
                    const isMe = entry.userId === currentUser?._id;
                    return (
                      <tr key={entry.userId} className={isMe ? "bg-blue-50" : "hover:bg-gray-50"}>
                        <td className="px-4 py-3 text-center font-semibold text-gray-600">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/players/${entry.userId}?league=${leagueId}`}
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
                        <td className="px-4 py-3 text-center text-gray-600">{entry.games}</td>
                        <td className="px-4 py-3 text-center font-semibold text-green-600">{entry.wins}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{entry.draws}</td>
                        <td className="px-4 py-3 text-center text-red-500">{entry.losses}</td>
                        <td className="px-4 py-3 text-center font-medium text-gray-700">
                          {entry.goalDiff > 0 ? `+${entry.goalDiff}` : entry.goalDiff}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">{entry.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 최근 경기 결과 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">최근 경기 결과</h2>
            <Link
              href={`/leagues/${leagueId}/matches`}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              전체 보기 →
            </Link>
          </div>
          {recentMatches === undefined ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : recentMatches.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              아직 입력된 경기 결과가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentMatches.slice(0, 5).map((match) => {
                const homeWon = match.homeScore > match.awayScore;
                const awayWon = match.awayScore > match.homeScore;
                const draw = match.homeScore === match.awayScore;
                // 7-3: 대전한 두 선수 모두 수정 가능, 관리자는 전체 가능
                const canEdit =
                  isManager ||
                  match.homeUserId === currentUser?._id ||
                  match.awayUserId === currentUser?._id;
                const isEditingThis = editingMatch?.id === match._id;
                return (
                  <li key={match._id} className="px-4 py-3">
                    {/* 7-2: 모든 컨트롤을 한 줄로 */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/players/${match.homeUserId}?league=${leagueId}`}
                        className={`flex-1 text-right text-sm font-medium hover:underline truncate ${homeWon ? "text-green-700" : draw ? "text-gray-700" : "text-gray-400"}`}
                      >
                        {displayName(match.homeUser)}
                        <WinBadge wins={match.homeUser?.leagueWins} />
                      </Link>

                      {/* 스코어 or 편집 인풋 */}
                      {isEditingThis ? (
                        <div className="shrink-0 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={editingMatch.homeScore}
                            onChange={(e) =>
                              setEditingMatch((prev) => prev ? { ...prev, homeScore: e.target.value } : prev)
                            }
                            className="w-10 rounded border border-gray-300 px-1 py-0.5 text-sm text-center outline-none focus:border-blue-500"
                          />
                          <span className="text-gray-500 font-bold text-sm">:</span>
                          <input
                            type="number"
                            min={0}
                            value={editingMatch.awayScore}
                            onChange={(e) =>
                              setEditingMatch((prev) => prev ? { ...prev, awayScore: e.target.value } : prev)
                            }
                            className="w-10 rounded border border-gray-300 px-1 py-0.5 text-sm text-center outline-none focus:border-blue-500"
                          />
                        </div>
                      ) : (
                        <span className="shrink-0 font-bold text-gray-900 text-base px-2">
                          {match.homeScore} : {match.awayScore}
                        </span>
                      )}

                      <Link
                        href={`/players/${match.awayUserId}?league=${leagueId}`}
                        className={`flex-1 text-left text-sm font-medium hover:underline truncate ${awayWon ? "text-green-700" : draw ? "text-gray-700" : "text-gray-400"}`}
                      >
                        {displayName(match.awayUser)}
                        <WinBadge wins={match.awayUser?.leagueWins} />
                      </Link>

                      {/* 수정/취소/저장 버튼 — 한 줄 */}
                      <div className="shrink-0 flex items-center gap-1">
                        {canEdit && (
                          isEditingThis ? (
                            <>
                              <button
                                onClick={() => handleMatchDelete(match._id)}
                                disabled={deletingId === match._id}
                                className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                {deletingId === match._id ? "..." : "삭제"}
                              </button>
                              <button
                                onClick={() => { setEditingMatch(null); setEditError(null); }}
                                className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                              >
                                취소
                              </button>
                              <button
                                onClick={handleMatchEditSave}
                                disabled={editSaving}
                                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {editSaving ? "..." : "저장"}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditError(null);
                                setEditingMatch({
                                  id: match._id,
                                  homeScore: String(match.homeScore),
                                  awayScore: String(match.awayScore),
                                });
                              }}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                            >
                              수정
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* 저장 오류 메시지 */}
                    {isEditingThis && editError && (
                      <p className="text-xs text-red-500 text-right mt-1">{editError}</p>
                    )}
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
