"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useMemo } from "react";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

export default function InnerwarDetailPage() {
  const params = useParams();
  const innerwarId = params.id as Id<"innerwars">;

  const detail = useQuery(api.innerwars.getDetail, { innerwarId });

  const joinInnerwar = useMutation(api.innerwars.join);
  const leaveInnerwar = useMutation(api.innerwars.leave);
  const assignTeamsRandom = useMutation(api.innerwars.assignTeamsRandom);
  const assignTeamsByScore = useMutation(api.innerwars.assignTeamsByScore);
  const setPlayerTeam = useMutation(api.innerwars.setPlayerTeam);
  const reorderTeamMember = useMutation(api.innerwars.reorderTeamMember);
  const startGame = useMutation(api.innerwars.startGame);
  const saveMatchScore = useMutation(api.innerwars.saveMatchScore);
  const confirmMatchResult = useMutation(api.innerwars.confirmMatchResult);
  const resetTeams = useMutation(api.innerwars.resetTeams);

  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editingScore, setEditingScore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  // 5-2: 전원 배정 완료 시 그리드 뷰 / 목록 뷰 전환
  const [showListView, setShowListView] = useState(false);

  const currentUser = detail?.currentUser ?? null;
  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isAuthenticated = !!currentUser;

  const innerwar = detail?.innerwar;
  const allParticipants = detail?.participants ?? [];
  const matches = detail?.matches ?? [];

  const teamAssignPermission = innerwar?.teamAssignPermission ?? "admin";
  const canManageTeam = teamAssignPermission === "all" ? isAuthenticated : isManager;

  const approvedParticipants = useMemo(
    () => allParticipants.filter((p) => !p.status || p.status === "approved"),
    [allParticipants]
  );

  const teamA = useMemo(
    () =>
      approvedParticipants
        .filter((p) => p.team === "A")
        .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0)),
    [approvedParticipants]
  );
  const teamB = useMemo(
    () =>
      approvedParticipants
        .filter((p) => p.team === "B")
        .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0)),
    [approvedParticipants]
  );
  const unassigned = useMemo(
    () => approvedParticipants.filter((p) => !p.team),
    [approvedParticipants]
  );

  const myParticipation = useMemo(
    () => currentUser ? allParticipants.find((p) => p.userId === currentUser._id) : null,
    [allParticipants, currentUser]
  );

  const allAssigned = approvedParticipants.length > 0 && unassigned.length === 0;
  const canStartGame = allAssigned && teamA.length > 0 && teamB.length > 0 && isAuthenticated;

  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === "done"),
    [matches]
  );

  const activeMatch = useMemo(
    () => matches.find((m) => m.status === "pending" || m.status === "scored"),
    [matches]
  );

  // 5-1: 현재 경기 양쪽 선수 여부 — 관리자 아닌 경우에도 점수 입력 가능
  const isCurrentMatchPlayer = !!(
    activeMatch &&
    currentUser &&
    (activeMatch.playerAId === currentUser._id || activeMatch.playerBId === currentUser._id)
  );
  const canInputScore = isManager || isCurrentMatchPlayer;

  const isLastMatch = useMemo(() => {
    if (!innerwar || teamA.length === 0 || teamB.length === 0) return false;
    return (
      (innerwar.currentIndexA ?? 0) === teamA.length - 1 &&
      (innerwar.currentIndexB ?? 0) === teamB.length - 1
    );
  }, [innerwar, teamA, teamB]);

  const stats = useMemo(() => {
    const result: Record<
      string,
      { name: string; team: string; wins: number; losses: number; draws: number; scored: number; conceded: number }
    > = {};

    for (const m of completedMatches) {
      const aId = m.playerAId as string;
      const bId = m.playerBId as string;
      const aTeam = approvedParticipants.find((p) => p.userId === m.playerAId)?.team ?? "?";
      const bTeam = approvedParticipants.find((p) => p.userId === m.playerBId)?.team ?? "?";

      if (!result[aId])
        result[aId] = { name: displayName(m.playerA), team: aTeam, wins: 0, losses: 0, draws: 0, scored: 0, conceded: 0 };
      if (!result[bId])
        result[bId] = { name: displayName(m.playerB), team: bTeam, wins: 0, losses: 0, draws: 0, scored: 0, conceded: 0 };

      result[aId].scored += m.scoreA ?? 0;
      result[aId].conceded += m.scoreB ?? 0;
      result[bId].scored += m.scoreB ?? 0;
      result[bId].conceded += m.scoreA ?? 0;

      if (m.winnerId === m.playerAId) {
        result[aId].wins++;
        result[bId].losses++;
      } else if (m.winnerId === m.playerBId) {
        result[bId].wins++;
        result[aId].losses++;
      } else {
        result[aId].draws++;
        result[bId].draws++;
      }
    }

    return Object.entries(result).sort((a, b) => b[1].wins - a[1].wins);
  }, [completedMatches, approvedParticipants]);

  async function handleJoin() {
    setJoining(true);
    try { await joinInnerwar({ innerwarId }); }
    finally { setJoining(false); }
  }

  async function handleLeave() {
    if (!confirm("참가 신청을 취소할까요?")) return;
    setJoining(true);
    try { await leaveInnerwar({ innerwarId }); }
    finally { setJoining(false); }
  }

  async function handleAssignTeam(participantId: Id<"innerwarParticipants">, team: "A" | "B" | "none") {
    setAssigningId(participantId);
    try {
      await setPlayerTeam({ participantId, team });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setAssigningId(null);
    }
  }

  async function handleReorder(participantId: Id<"innerwarParticipants">, direction: "up" | "down") {
    setReordering(participantId);
    try { await reorderTeamMember({ participantId, direction }); }
    finally { setReordering(null); }
  }

  async function handleSaveScore(matchId: Id<"innerwarMatches">) {
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (isNaN(sA) || isNaN(sB) || sA < 0 || sB < 0) {
      setError("유효한 점수를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveMatchScore({ matchId, scoreA: sA, scoreB: sB });
      setEditingScore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmResult(matchId: Id<"innerwarMatches">) {
    setConfirming(true);
    setError(null);
    try {
      await confirmMatchResult({ matchId });
      setScoreA("0");
      setScoreB("0");
      setEditingScore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  function startEditScore(sA: number, sB: number) {
    setScoreA(String(sA));
    setScoreB(String(sB));
    setEditingScore(true);
    setError(null);
  }

  async function handleReset() {
    const gameStarted = status === "inProgress" || status === "done";
    if (gameStarted && !isManager) {
      alert("경기 시작 후에는 관리자만 초기화할 수 있습니다.");
      return;
    }
    if (!gameStarted && !canManageTeam) {
      alert("권한이 없습니다.");
      return;
    }
    if (!confirm("팀 배정을 초기화하고 처음부터 다시 시작할까요?")) return;
    setResetting(true);
    try {
      await resetTeams({ innerwarId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setResetting(false);
    }
  }

  // 4-4: 모든 인증 사용자 순번 변경 가능
  function renderOrderButtons(
    p: typeof approvedParticipants[0],
    idx: number,
    teamLength: number
  ) {
    if (!isAuthenticated) return null;
    const st = innerwar?.status ?? "draft";
    if (st === "inProgress" || st === "done") return null;
    return (
      <div className="flex gap-0.5">
        <button
          onClick={() => handleReorder(p._id, "up")}
          disabled={idx === 0 || reordering === p._id}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 text-xs"
        >▲</button>
        <button
          onClick={() => handleReorder(p._id, "down")}
          disabled={idx === teamLength - 1 || reordering === p._id}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 text-xs"
        >▼</button>
      </div>
    );
  }

  // 5-1: 초기화 버튼 - 누구나 클릭 가능, 권한 없으면 handleReset에서 메시지 표시
  function renderResetButton(_isGameStarted: boolean) {
    return (
      <button
        onClick={handleReset}
        disabled={resetting}
        className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
      >
        {resetting ? "초기화 중..." : "초기화"}
      </button>
    );
  }

  if (detail === undefined) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">불러오는 중...</div>;
  }
  if (detail === null || !innerwar) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">내전을 찾을 수 없습니다.</div>;
  }

  const status = innerwar.status ?? "draft";
  // 5-2: 전원 배정 시 기본으로 그리드 뷰 표시
  const showGrid = allAssigned && !showListView;

  // 공통: 자동배정 버튼 + 그리드 (teamAssigned와 동일한 레이아웃)
  function renderTeamGrid(showAutoAssign: boolean) {
    return (
      <>
        {showAutoAssign && canManageTeam && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => assignTeamsRandom({ innerwarId })}
              disabled={approvedParticipants.length < 2}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              랜덤 배정
            </button>
            <button
              onClick={() => assignTeamsByScore({ innerwarId })}
              disabled={approvedParticipants.length < 2}
              className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
            >
              성적기반 배정
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">A팀</h4>
            <ul className="space-y-1.5">
              {teamA.map((p, idx) => (
                <li key={p._id} className="flex items-center justify-between gap-1">
                  <span className="text-sm text-gray-700">
                    <span className="text-gray-400 mr-1.5">{idx + 1}.</span>
                    {displayName(p.user)}
                  </span>
                  {renderOrderButtons(p, idx, teamA.length)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-700 mb-2">B팀</h4>
            <ul className="space-y-1.5">
              {teamB.map((p, idx) => (
                <li key={p._id} className="flex items-center justify-between gap-1">
                  <span className="text-sm text-gray-700">
                    <span className="text-gray-400 mr-1.5">{idx + 1}.</span>
                    {displayName(p.user)}
                  </span>
                  {renderOrderButtons(p, idx, teamB.length)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {isAuthenticated && (
          <>
            <div className="flex gap-3 text-sm text-gray-500 mb-2">
              <span className="text-blue-600 font-medium">A팀 {teamA.length}명</span>
              <span>vs</span>
              <span className="text-red-600 font-medium">B팀 {teamB.length}명</span>
            </div>
            <button
              onClick={() => startGame({ innerwarId })}
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              경기 시작
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/innerwars" className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0">
            ← 목록
          </Link>
          <div className="min-w-0">
            <span className="text-xs font-medium text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 mr-2">
              {innerwar.year}.{String(innerwar.month).padStart(2, "0")}.{String(innerwar.day).padStart(2, "0")}
            </span>
            <span className="text-lg font-bold text-gray-900">{innerwar.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
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

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* 내 참가 상태 */}
        {currentUser && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">내 참가 상태</span>
            <div className="flex items-center gap-2">
              {!myParticipation && (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {joining ? "처리 중..." : "참가 신청"}
                </button>
              )}
              {myParticipation?.status === "approved" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                    참가 중{myParticipation.team && <span className="ml-1 font-bold">{myParticipation.team}팀</span>}
                  </span>
                  {status === "draft" && (
                    <button onClick={handleLeave} disabled={joining} className="text-xs text-gray-400 hover:text-red-500">
                      취소
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── draft 상태: 팀 배정 ── */}
        {status === "draft" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">팀 배정</h3>
              <div className="flex items-center gap-2">
                {/* 5-2: 전원 배정 완료 시 뷰 전환 버튼 */}
                {allAssigned && canManageTeam && (
                  <button
                    onClick={() => setShowListView(!showListView)}
                    className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                  >
                    {showListView ? "그리드 뷰" : "개별 조정"}
                  </button>
                )}
                <span className="text-xs text-gray-400">참가자 {approvedParticipants.length}명</span>
              </div>
            </div>
            <div className="px-5 py-4">
              {approvedParticipants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">참가자가 없습니다.</p>
              ) : showGrid ? (
                /* 5-2: 전원 배정 완료 → 랜덤 배정 결과와 동일한 그리드 레이아웃 */
                renderTeamGrid(true)
              ) : (
                /* 미배정 참가자 있음 or 개별 조정 모드: 개별 배정 뷰 */
                <>
                  {canManageTeam && (
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => assignTeamsRandom({ innerwarId })}
                        disabled={approvedParticipants.length < 2}
                        className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        랜덤 배정
                      </button>
                      <button
                        onClick={() => assignTeamsByScore({ innerwarId })}
                        disabled={approvedParticipants.length < 2}
                        className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
                      >
                        성적기반 배정
                      </button>
                    </div>
                  )}

                  <ul className="space-y-2">
                    {approvedParticipants.map((p) => {
                      const sameTeamList = p.team === "A" ? teamA : p.team === "B" ? teamB : [];
                      const idx = sameTeamList.findIndex((t) => t._id === p._id);
                      return (
                        <li key={p._id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {p.team && (
                              <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                            )}
                            <span className="text-sm font-medium text-gray-800">
                              {displayName(p.user)}
                            </span>
                            {p.team && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                p.team === "A" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                              }`}>
                                {p.team}팀
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {p.team && renderOrderButtons(p, idx, sameTeamList.length)}
                            {canManageTeam && (
                              <>
                                <button
                                  onClick={() => handleAssignTeam(p._id, "A")}
                                  disabled={assigningId === p._id || p.team === "A"}
                                  className={`text-xs px-2 py-1 rounded font-semibold transition-colors ${
                                    p.team === "A" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                  } disabled:opacity-50`}
                                >
                                  A팀
                                </button>
                                <button
                                  onClick={() => handleAssignTeam(p._id, "B")}
                                  disabled={assigningId === p._id || p.team === "B"}
                                  className={`text-xs px-2 py-1 rounded font-semibold transition-colors ${
                                    p.team === "B" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"
                                  } disabled:opacity-50`}
                                >
                                  B팀
                                </button>
                                {p.team && (
                                  <button
                                    onClick={() => handleAssignTeam(p._id, "none")}
                                    disabled={assigningId === p._id}
                                    className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                  >
                                    해제
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {canStartGame && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex gap-3 text-sm text-gray-500 mb-2">
                        <span className="text-blue-600 font-medium">A팀 {teamA.length}명</span>
                        <span>vs</span>
                        <span className="text-red-600 font-medium">B팀 {teamB.length}명</span>
                      </div>
                      <button
                        onClick={() => startGame({ innerwarId })}
                        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                      >
                        경기 시작
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── teamAssigned 상태: 랜덤/성적기반 배정 결과 그리드 ── */}
        {status === "teamAssigned" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">팀 배정 완료</h3>
              {renderResetButton(false)}
            </div>
            <div className="px-5 py-4">
              {renderTeamGrid(false)}
            </div>
          </div>
        )}

        {/* ── inProgress 상태: 경기 진행 ── */}
        {status === "inProgress" && (
          <>
            {/* 4-1: 마지막 경기 알림 */}
            {isLastMatch && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                <p className="text-sm font-semibold text-amber-800">⚠️ 마지막 경기입니다</p>
                <p className="text-xs text-amber-700 mt-1">
                  양 팀의 마지막 선수입니다. 동점은 허용되지 않습니다.
                  동점 시 연장이나 승부차기 설정을 하세요.
                </p>
              </div>
            )}

            {/* 현재 경기 */}
            {activeMatch && (
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-blue-900">
                    {completedMatches.length + 1}경기
                  </h3>
                  {/* 5-1: 경기 중 초기화 - 관리자만 */}
                  {renderResetButton(true)}
                </div>
                <div className="px-5 py-5">
                  <div className="flex items-center justify-center gap-6 mb-5">
                    <div className="text-center">
                      <div className="text-xs font-bold text-blue-600 mb-1">A팀</div>
                      <div className="text-base font-bold text-gray-900">{displayName(activeMatch.playerA)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {teamA.findIndex((p) => p.userId === activeMatch.playerAId) + 1}번 선수
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-gray-300">VS</span>
                    <div className="text-center">
                      <div className="text-xs font-bold text-red-600 mb-1">B팀</div>
                      <div className="text-base font-bold text-gray-900">{displayName(activeMatch.playerB)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {teamB.findIndex((p) => p.userId === activeMatch.playerBId) + 1}번 선수
                      </div>
                    </div>
                  </div>

                  {canInputScore && (
                    <>
                      {activeMatch.status === "pending" && (
                        <>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-blue-600 mb-1 text-center">A팀 점수</label>
                              <input
                                type="number" min={0} value={scoreA}
                                onChange={(e) => setScoreA(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <span className="text-gray-400 font-bold text-xl mt-4">:</span>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-red-600 mb-1 text-center">B팀 점수</label>
                              <input
                                type="number" min={0} value={scoreB}
                                onChange={(e) => setScoreB(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                              />
                            </div>
                          </div>
                          {isLastMatch && (
                            <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 mb-3 text-center">
                              마지막 경기는 동점이 허용되지 않습니다
                            </p>
                          )}
                          {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
                          <button
                            onClick={() => handleSaveScore(activeMatch._id)}
                            disabled={submitting}
                            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {submitting ? "저장 중..." : "점수 저장"}
                          </button>
                        </>
                      )}

                      {activeMatch.status === "scored" && (
                        <>
                          {!editingScore ? (
                            <>
                              <div className="flex items-center justify-center gap-6 mb-4">
                                <div className="text-center">
                                  <div className="text-xs text-blue-600 mb-1">A팀</div>
                                  <div className={`text-3xl font-black ${
                                    activeMatch.scoreA === activeMatch.scoreB ? "text-gray-500" :
                                    (activeMatch.scoreA ?? 0) > (activeMatch.scoreB ?? 0) ? "text-blue-700" : "text-gray-400"
                                  }`}>{activeMatch.scoreA}</div>
                                </div>
                                <span className="text-2xl font-bold text-gray-300">:</span>
                                <div className="text-center">
                                  <div className="text-xs text-red-600 mb-1">B팀</div>
                                  <div className={`text-3xl font-black ${
                                    activeMatch.scoreA === activeMatch.scoreB ? "text-gray-500" :
                                    (activeMatch.scoreB ?? 0) > (activeMatch.scoreA ?? 0) ? "text-red-700" : "text-gray-400"
                                  }`}>{activeMatch.scoreB}</div>
                                </div>
                              </div>
                              {activeMatch.scoreA === activeMatch.scoreB && (
                                <div className={`text-center text-sm font-semibold mb-3 py-2 rounded-lg ${
                                  isLastMatch ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"
                                }`}>
                                  {isLastMatch
                                    ? "동점 확정 불가 — 연장 또는 승부차기로 재경기하세요"
                                    : "동점 — 확정 시 양 팀 모두 탈락합니다"}
                                </div>
                              )}
                              {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => startEditScore(activeMatch.scoreA ?? 0, activeMatch.scoreB ?? 0)}
                                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                                >
                                  점수 수정
                                </button>
                                <button
                                  onClick={() => handleConfirmResult(activeMatch._id)}
                                  disabled={confirming}
                                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {confirming ? "확정 중..." : "다음 경기"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-blue-600 mb-1 text-center">A팀 점수</label>
                                  <input
                                    type="number" min={0} value={scoreA}
                                    onChange={(e) => setScoreA(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                                <span className="text-gray-400 font-bold text-xl mt-4">:</span>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-red-600 mb-1 text-center">B팀 점수</label>
                                  <input
                                    type="number" min={0} value={scoreB}
                                    onChange={(e) => setScoreB(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                  />
                                </div>
                              </div>
                              {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setEditingScore(false); setError(null); }}
                                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                                >
                                  취소
                                </button>
                                <button
                                  onClick={() => handleSaveScore(activeMatch._id)}
                                  disabled={submitting}
                                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {submitting ? "저장 중..." : "저장"}
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 팀 현황 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">팀 현황</h3>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-blue-600 mb-2">A팀</h4>
                  {teamA.map((p, idx) => {
                    const currentIdx = innerwar.currentIndexA ?? 0;
                    const isPlaying = idx === currentIdx;
                    const isEliminated = idx < currentIdx;
                    return (
                      <div key={p._id} className={`text-sm py-0.5 ${
                        isEliminated ? "text-gray-300 line-through" :
                        isPlaying ? "text-blue-700 font-bold" : "text-gray-600"
                      }`}>
                        {idx + 1}. {displayName(p.user)}
                        {isPlaying && <span className="ml-1 text-xs">▶</span>}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-red-600 mb-2">B팀</h4>
                  {teamB.map((p, idx) => {
                    const currentIdx = innerwar.currentIndexB ?? 0;
                    const isPlaying = idx === currentIdx;
                    const isEliminated = idx < currentIdx;
                    return (
                      <div key={p._id} className={`text-sm py-0.5 ${
                        isEliminated ? "text-gray-300 line-through" :
                        isPlaying ? "text-red-700 font-bold" : "text-gray-600"
                      }`}>
                        {idx + 1}. {displayName(p.user)}
                        {isPlaying && <span className="ml-1 text-xs">▶</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── done 상태: 완료 ── */}
        {status === "done" && innerwar.winnerTeam && (
          <div className={`rounded-xl px-6 py-8 text-center shadow-sm border ${
            innerwar.winnerTeam === "A" ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"
          }`}>
            <div className="text-5xl mb-3">🎉</div>
            <h2 className={`text-2xl font-black mb-1 ${
              innerwar.winnerTeam === "A" ? "text-blue-700" : "text-red-700"
            }`}>
              {innerwar.winnerTeam}팀 승리!
            </h2>
            <p className="text-sm text-gray-500 mb-4">총 {completedMatches.length}경기</p>
            {/* 5-1: 경기 종료 후 초기화도 관리자만 */}
            <div className="flex justify-center">
              {renderResetButton(true)}
            </div>
          </div>
        )}

        {/* 경기 기록 */}
        {completedMatches.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">전체 경기 결과</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3 text-center w-10">#</th>
                    <th className="px-4 py-3 text-right">A팀</th>
                    <th className="px-4 py-3 text-center w-20">스코어</th>
                    <th className="px-4 py-3 text-left">B팀</th>
                    <th className="px-4 py-3 text-center w-20">결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {completedMatches.map((m, idx) => {
                    const aWon = m.winnerId === m.playerAId;
                    const bWon = m.winnerId === m.playerBId;
                    const isDraw = !m.winnerId;
                    return (
                      <tr key={m._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center text-gray-400">{idx + 1}</td>
                        <td className={`px-4 py-3 text-right font-medium ${aWon ? "text-blue-700" : isDraw ? "text-gray-500" : "text-gray-400"}`}>
                          {displayName(m.playerA)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">
                          {m.scoreA} - {m.scoreB}
                        </td>
                        <td className={`px-4 py-3 text-left font-medium ${bWon ? "text-red-700" : isDraw ? "text-gray-500" : "text-gray-400"}`}>
                          {displayName(m.playerB)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold">
                          {aWon ? (
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">A승</span>
                          ) : bWon ? (
                            <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">B승</span>
                          ) : (
                            <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">동반탈락</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 개인 통계 */}
        {stats.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">개인 통계</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">선수</th>
                    <th className="px-4 py-3 text-center w-12">팀</th>
                    <th className="px-4 py-3 text-center w-12">승</th>
                    <th className="px-4 py-3 text-center w-12">무</th>
                    <th className="px-4 py-3 text-center w-12">패</th>
                    <th className="px-4 py-3 text-center w-14">득점</th>
                    <th className="px-4 py-3 text-center w-14">실점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.map(([userId, s]) => (
                    <tr key={userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                          s.team === "A" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                        }`}>{s.team}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">{s.wins}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{s.draws}</td>
                      <td className="px-4 py-3 text-center text-red-500">{s.losses}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{s.scored}</td>
                      <td className="px-4 py-3 text-center text-gray-400">{s.conceded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
