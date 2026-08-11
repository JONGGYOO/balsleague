"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { WinBadge } from "@/app/components/WinBadge";
import { ParticipantPicker } from "@/app/clanwars/components/ParticipantPicker";

type Participant = {
  _id: Id<"clanwarParticipants">;
  side: "home" | "away";
  sourceType: "user" | "otherClanUser";
  userId?: Id<"users"> | null;
  otherClanUserId?: Id<"otherClanUsers"> | null;
  teamOrder?: number;
  orderLocked?: boolean;
  displayName: string;
  leagueWins?: number;
};

function ParticipantName({ p }: { p: Participant }) {
  return (
    <>
      {p.sourceType === "user" && p.userId ? (
        <Link href={`/players/${p.userId}`} className="hover:underline">
          {p.displayName}
        </Link>
      ) : (
        <span>{p.displayName}</span>
      )}
      {p.sourceType === "user" && <WinBadge wins={p.leagueWins} />}
    </>
  );
}

const GAME_MODE_LABEL: Record<string, string> = {
  deathmatch: "데스매치",
  normalMatch: "일반매치",
};

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="1" y="5" width="22" height="14" rx="4" fill="#FF0000" />
      <path d="M10 8.5l6 3.5-6 3.5z" fill="#fff" />
    </svg>
  );
}

function BroadcastLink({ url }: { url?: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="방송 다시보기"
      className="ml-1.5 inline-block align-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <YoutubeIcon className="w-4 h-4 inline-block" />
    </a>
  );
}

export default function ClanwarDetailPage() {
  const params = useParams();
  const clanwarId = params.id as Id<"clanwars">;

  const detail = useQuery(api.clanwars.getDetail, { clanwarId });

  const removeParticipant = useMutation(api.clanwars.removeParticipant);
  const reorderParticipant = useMutation(api.clanwars.reorderParticipant);
  const toggleOrderLock = useMutation(api.clanwars.toggleOrderLock);
  const startGame = useMutation(api.clanwars.startGame);
  const resetTeams = useMutation(api.clanwars.resetTeams);

  const saveDeathmatchScore = useMutation(api.clanwars.saveDeathmatchScore);
  const confirmDeathmatchResult = useMutation(api.clanwars.confirmDeathmatchResult);
  const editLastDeathmatchResult = useMutation(api.clanwars.editLastDeathmatchResult);

  const submitNormalMatchResult = useMutation(api.clanwars.submitNormalMatchResult);
  const editLastNormalMatchResult = useMutation(api.clanwars.editLastNormalMatchResult);

  const editDoneDeathmatchScore = useMutation(api.clanwars.editDoneDeathmatchScore);
  const editDoneNormalMatchResult = useMutation(api.clanwars.editDoneNormalMatchResult);

  const [scoreHome, setScoreHome] = useState("0");
  const [scoreAway, setScoreAway] = useState("0");
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editingScore, setEditingScore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingPrev, setEditingPrev] = useState(false);
  const [prevScoreHome, setPrevScoreHome] = useState("0");
  const [prevScoreAway, setPrevScoreAway] = useState("0");
  const [prevBroadcastUrl, setPrevBroadcastUrl] = useState("");
  const [prevSaving, setPrevSaving] = useState(false);
  const [prevError, setPrevError] = useState<string | null>(null);

  const [normalBroadcastUrl, setNormalBroadcastUrl] = useState("");
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [editingPrevResult, setEditingPrevResult] = useState(false);
  const [prevResultBroadcastUrl, setPrevResultBroadcastUrl] = useState("");
  const [prevResultSaving, setPrevResultSaving] = useState(false);

  // 클전 종료 이후: 임의의 확정 경기 점수/결과/방송 링크 정정 (마지막 경기 한정 아님)
  const [editingMatchId, setEditingMatchId] = useState<Id<"clanwarMatches"> | null>(null);
  const [editRowScoreHome, setEditRowScoreHome] = useState("0");
  const [editRowScoreAway, setEditRowScoreAway] = useState("0");
  const [editRowBroadcastUrl, setEditRowBroadcastUrl] = useState("");
  const [editRowSaving, setEditRowSaving] = useState(false);
  const [editRowError, setEditRowError] = useState<string | null>(null);

  const [reordering, setReordering] = useState<string | null>(null);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const currentUser = detail?.currentUser ?? null;
  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isAuthenticated = !!currentUser;

  const clanwar = detail?.clanwar;
  const participants = useMemo(() => detail?.participants ?? [], [detail]);
  const matches = useMemo(() => detail?.matches ?? [], [detail]);

  const home = useMemo(
    () =>
      participants
        .filter((p) => p.side === "home")
        .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0)),
    [participants]
  );
  const away = useMemo(
    () =>
      participants
        .filter((p) => p.side === "away")
        .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0)),
    [participants]
  );

  const canStartGame = home.length > 0 && away.length > 0 && isManager;

  const completedMatches = useMemo(() => matches.filter((m) => m.status === "done"), [matches]);
  const activeMatch = useMemo(
    () => matches.find((m) => m.status === "pending" || m.status === "scored"),
    [matches]
  );
  const activeMatchScored = activeMatch ? activeMatch.status === "scored" : true;

  const lastCompletedMatch = completedMatches[completedMatches.length - 1] ?? null;
  const canEditLast = !!(isManager && lastCompletedMatch && (!activeMatch || activeMatch.status === "pending"));

  const isLastMatch = useMemo(() => {
    if (!clanwar || home.length === 0 || away.length === 0) return false;
    return (
      (clanwar.currentIndexHome ?? 0) === home.length - 1 &&
      (clanwar.currentIndexAway ?? 0) === away.length - 1
    );
  }, [clanwar, home, away]);

  const normalTally = useMemo(() => {
    let homeWins = 0, awayWins = 0, draws = 0;
    for (const m of completedMatches) {
      if (m.result === "home") homeWins++;
      else if (m.result === "away") awayWins++;
      else if (m.result === "draw") draws++;
    }
    return { homeWins, awayWins, draws };
  }, [completedMatches]);

  async function handleReorder(participantId: Id<"clanwarParticipants">, direction: "up" | "down") {
    setReordering(participantId);
    try {
      await reorderParticipant({ participantId, direction });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setReordering(null);
    }
  }

  async function handleToggleLock(participantId: Id<"clanwarParticipants">) {
    setLockingId(participantId);
    try {
      await toggleOrderLock({ participantId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLockingId(null);
    }
  }

  async function handleRemoveParticipant(participantId: Id<"clanwarParticipants">, name: string) {
    if (!confirm(`${name}님을 클전에서 제외할까요?`)) return;
    setRemovingId(participantId);
    try {
      await removeParticipant({ participantId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleReset() {
    if (!confirm("진행 상태를 초기화하고 로스터 구성 단계로 되돌릴까요? (로스터 자체는 유지됩니다)")) return;
    setResetting(true);
    try {
      await resetTeams({ clanwarId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setResetting(false);
    }
  }

  // ── 데스매치 점수 입력 ──
  async function handleSaveScore(matchId: Id<"clanwarMatches">) {
    const sH = parseInt(scoreHome, 10);
    const sA = parseInt(scoreAway, 10);
    if (isNaN(sH) || isNaN(sA) || sH < 0 || sA < 0) {
      setError("유효한 점수를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveDeathmatchScore({ matchId, scoreHome: sH, scoreAway: sA, broadcastUrl: broadcastUrl.trim() || undefined });
      setEditingScore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmResult(matchId: Id<"clanwarMatches">) {
    setConfirming(true);
    setError(null);
    try {
      await confirmDeathmatchResult({ matchId });
      setScoreHome("0");
      setScoreAway("0");
      setBroadcastUrl("");
      setEditingScore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  function startEditScore(sH: number, sA: number, url?: string | null) {
    setScoreHome(String(sH));
    setScoreAway(String(sA));
    setBroadcastUrl(url ?? "");
    setEditingScore(true);
    setError(null);
  }

  function startEditPrev() {
    if (!lastCompletedMatch) return;
    setPrevScoreHome(String(lastCompletedMatch.scoreHome ?? 0));
    setPrevScoreAway(String(lastCompletedMatch.scoreAway ?? 0));
    setPrevBroadcastUrl(lastCompletedMatch.broadcastUrl ?? "");
    setPrevError(null);
    setEditingPrev(true);
  }

  async function handleSavePrevMatch() {
    if (!lastCompletedMatch) return;
    const sH = parseInt(prevScoreHome, 10);
    const sA = parseInt(prevScoreAway, 10);
    if (isNaN(sH) || isNaN(sA) || sH < 0 || sA < 0) {
      setPrevError("유효한 점수를 입력하세요.");
      return;
    }
    setPrevSaving(true);
    setPrevError(null);
    try {
      await editLastDeathmatchResult({
        matchId: lastCompletedMatch._id,
        scoreHome: sH,
        scoreAway: sA,
        broadcastUrl: prevBroadcastUrl.trim() || undefined,
      });
      setEditingPrev(false);
    } catch (err) {
      setPrevError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setPrevSaving(false);
    }
  }

  // ── 일반매치 결과 입력 ──
  async function handleSubmitResult(matchId: Id<"clanwarMatches">, result: "home" | "away" | "draw") {
    setResultSubmitting(true);
    setResultError(null);
    try {
      await submitNormalMatchResult({ matchId, result, broadcastUrl: normalBroadcastUrl.trim() || undefined });
      setNormalBroadcastUrl("");
    } catch (err) {
      setResultError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setResultSubmitting(false);
    }
  }

  function startEditPrevResult() {
    setPrevResultBroadcastUrl(lastCompletedMatch?.broadcastUrl ?? "");
    setEditingPrevResult(true);
  }

  async function handleEditPrevResult(result: "home" | "away" | "draw") {
    if (!lastCompletedMatch) return;
    setPrevResultSaving(true);
    try {
      await editLastNormalMatchResult({
        matchId: lastCompletedMatch._id,
        result,
        broadcastUrl: prevResultBroadcastUrl.trim() || undefined,
      });
      setEditingPrevResult(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setPrevResultSaving(false);
    }
  }

  // ── 클전 종료 이후: 임의 행 정정 ──
  function startEditDoneRow(m: (typeof matches)[number]) {
    setEditRowScoreHome(String(m.scoreHome ?? 0));
    setEditRowScoreAway(String(m.scoreAway ?? 0));
    setEditRowBroadcastUrl(m.broadcastUrl ?? "");
    setEditRowError(null);
    setEditingMatchId(m._id);
  }

  async function handleSaveDoneScore() {
    if (!editingMatchId) return;
    const sH = parseInt(editRowScoreHome, 10);
    const sA = parseInt(editRowScoreAway, 10);
    if (isNaN(sH) || isNaN(sA) || sH < 0 || sA < 0) {
      setEditRowError("유효한 점수를 입력하세요.");
      return;
    }
    setEditRowSaving(true);
    setEditRowError(null);
    try {
      await editDoneDeathmatchScore({
        matchId: editingMatchId,
        scoreHome: sH,
        scoreAway: sA,
        broadcastUrl: editRowBroadcastUrl.trim() || undefined,
      });
      setEditingMatchId(null);
    } catch (err) {
      setEditRowError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setEditRowSaving(false);
    }
  }

  async function handleSaveDoneResult(result: "home" | "away" | "draw") {
    if (!editingMatchId) return;
    setEditRowSaving(true);
    setEditRowError(null);
    try {
      await editDoneNormalMatchResult({
        matchId: editingMatchId,
        result,
        broadcastUrl: editRowBroadcastUrl.trim() || undefined,
      });
      setEditingMatchId(null);
    } catch (err) {
      setEditRowError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setEditRowSaving(false);
    }
  }

  function renderOrderButtons(p: Participant, idx: number, sideLength: number, minIdx = -1, activeScored = true) {
    if (!isAuthenticated) return null;
    const st = clanwar?.status ?? "draft";
    if (st === "done") return null;
    if (p.orderLocked) {
      return (
        <span className="w-6 h-6 flex items-center justify-center text-amber-500 text-xs" title="순번 고정됨">
          🔒
        </span>
      );
    }
    const boundary = st === "inProgress" ? (activeScored ? minIdx : minIdx - 1) : -1;
    if (idx <= boundary) return null;
    return (
      <div className="flex gap-0.5">
        <button
          onClick={() => handleReorder(p._id, "up")}
          disabled={idx <= boundary + 1 || reordering === p._id}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 text-xs"
        >▲</button>
        <button
          onClick={() => handleReorder(p._id, "down")}
          disabled={idx === sideLength - 1 || reordering === p._id}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 text-xs"
        >▼</button>
      </div>
    );
  }

  function renderLockButton(p: Participant) {
    if (!isManager) return null;
    const st = clanwar?.status ?? "draft";
    if (st === "done") return null;
    return (
      <button
        onClick={() => handleToggleLock(p._id)}
        disabled={lockingId === p._id}
        title={p.orderLocked ? "순번 고정 해제" : "현재 순번 고정"}
        className={`w-6 h-6 flex items-center justify-center rounded text-xs disabled:opacity-50 ${
          p.orderLocked
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {lockingId === p._id ? "…" : p.orderLocked ? "🔒" : "🔓"}
      </button>
    );
  }

  function renderResetButton() {
    if (!isManager) return null;
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
  if (detail === null || !clanwar) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">클전을 찾을 수 없습니다.</div>;
  }

  const status = clanwar.status ?? "draft";
  const gameMode = clanwar.gameMode;

  function renderRosterSide(side: "home" | "away", list: Participant[], clanName: string, colorClass: string) {
    const currentIdx = side === "home" ? (clanwar!.currentIndexHome ?? 0) : (clanwar!.currentIndexAway ?? 0);
    return (
      <div>
        <h4 className={`text-sm font-bold mb-2 ${colorClass}`}>{clanName}</h4>
        <ul className="space-y-1.5">
          {list.map((p, idx) => {
            const isPlaying = status === "inProgress" && idx === currentIdx;
            const isEliminated = status === "inProgress" && idx < currentIdx && gameMode === "deathmatch";
            return (
              <li
                key={p._id}
                className={`flex items-center justify-between gap-1 text-sm ${
                  isEliminated ? "text-gray-300 line-through" : isPlaying ? `font-bold ${colorClass}` : "text-gray-700"
                }`}
              >
                <span>
                  <span className="text-gray-400 mr-1.5">{idx + 1}.</span>
                  <ParticipantName p={p} />
                  {isPlaying && <span className="ml-1 text-xs">▶</span>}
                </span>
                <div className="flex items-center gap-1">
                  {renderLockButton(p)}
                  {renderOrderButtons(p, idx, list.length, currentIdx, activeMatchScored)}
                  {isManager && status !== "inProgress" && (
                    <button
                      onClick={() => handleRemoveParticipant(p._id, p.displayName)}
                      disabled={removingId === p._id}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 text-xs"
                      title="제외"
                    >✕</button>
                  )}
                  {isManager && status === "inProgress" && idx > currentIdx && (
                    <button
                      onClick={() => handleRemoveParticipant(p._id, p.displayName)}
                      disabled={removingId === p._id}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 text-xs"
                      title="제외"
                    >✕</button>
                  )}
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="text-xs text-gray-400 py-2">참가자가 없습니다.</li>}
        </ul>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/clanwars" className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0">
            ← 목록
          </Link>
          <div className="min-w-0">
            <span className="text-xs font-medium text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 mr-2">
              {clanwar.year}.{String(clanwar.month).padStart(2, "0")}.{String(clanwar.day).padStart(2, "0")}
            </span>
            <span className="text-lg font-bold text-gray-900">{clanwar.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
          {currentUser && (currentUser.nickname || currentUser.name) && (
            <Link href="/profile" className="text-sm font-medium text-gray-700 hover:text-blue-600">
              {currentUser.nickname ?? currentUser.name}
              <WinBadge wins={currentUser.leagueWins} />
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{clanwar.homeClanName}</span>
          <span>vs</span>
          <span className="font-semibold text-gray-800">{clanwar.awayClanName}</span>
          <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
            {GAME_MODE_LABEL[gameMode]}
          </span>
        </div>

        {/* ── draft: 로스터 구성 ── */}
        {status === "draft" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">로스터 구성</h3>
              <span className="text-xs text-gray-400">
                {clanwar.homeClanName} {home.length}명 · {clanwar.awayClanName} {away.length}명
              </span>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  {renderRosterSide("home", home, clanwar.homeClanName, "text-blue-700")}
                  {isManager && (
                    <ParticipantPicker
                      clanwarId={clanwarId}
                      side="home"
                      clanName={clanwar.homeClanName}
                      existingParticipants={participants}
                    />
                  )}
                </div>
                <div>
                  {renderRosterSide("away", away, clanwar.awayClanName, "text-red-700")}
                  {isManager && (
                    <ParticipantPicker
                      clanwarId={clanwarId}
                      side="away"
                      clanName={clanwar.awayClanName}
                      existingParticipants={participants}
                    />
                  )}
                </div>
              </div>

              {canStartGame && (
                <div className="pt-4 border-t border-gray-100">
                  <button
                    onClick={() => startGame({ clanwarId })}
                    className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    경기 시작
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── inProgress ── */}
        {status === "inProgress" && (
          <>
            {gameMode === "deathmatch" && isLastMatch && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                <p className="text-sm font-semibold text-amber-800">⚠️ 마지막 경기입니다</p>
                <p className="text-xs text-amber-700 mt-1">
                  양쪽 모두 마지막 참가자입니다. 이번 경기가 동점이면 클전이 무승부로 종료됩니다.
                </p>
              </div>
            )}

            {/* 데스매치: 현재 경기 카드 */}
            {gameMode === "deathmatch" && activeMatch && (
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-blue-900">{completedMatches.length + 1}경기</h3>
                  {renderResetButton()}
                </div>
                <div className="px-5 py-5">
                  <div className="flex items-center justify-center gap-6 mb-5">
                    <div className="text-center">
                      <div className="text-xs font-bold text-blue-600 mb-1">{clanwar.homeClanName}</div>
                      <div className="text-base font-bold text-gray-900">
                        {activeMatch.home && <ParticipantName p={activeMatch.home} />}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {home.findIndex((p) => p._id === activeMatch.homeParticipantId) + 1}번
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-gray-300">VS</span>
                    <div className="text-center">
                      <div className="text-xs font-bold text-red-600 mb-1">{clanwar.awayClanName}</div>
                      <div className="text-base font-bold text-gray-900">
                        {activeMatch.away && <ParticipantName p={activeMatch.away} />}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {away.findIndex((p) => p._id === activeMatch.awayParticipantId) + 1}번
                      </div>
                    </div>
                  </div>

                  {isManager && (
                    <>
                      {activeMatch.status === "pending" && (
                        <>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-blue-600 mb-1 text-center">
                                {clanwar.homeClanName} 점수
                              </label>
                              <input
                                type="number" min={0} value={scoreHome}
                                onChange={(e) => setScoreHome(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <span className="text-gray-400 font-bold text-xl mt-4">:</span>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-red-600 mb-1 text-center">
                                {clanwar.awayClanName} 점수
                              </label>
                              <input
                                type="number" min={0} value={scoreAway}
                                onChange={(e) => setScoreAway(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                              />
                            </div>
                          </div>
                          <input
                            type="text"
                            value={broadcastUrl}
                            onChange={(e) => setBroadcastUrl(e.target.value)}
                            placeholder="방송 링크 (선택, 예: 유튜브 URL)"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
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
                        !editingScore ? (
                          <>
                            <div className="flex items-center justify-center gap-6 mb-4">
                              <div className="text-center">
                                <div className="text-xs text-blue-600 mb-1">{clanwar.homeClanName}</div>
                                <div className={`text-3xl font-black ${
                                  activeMatch.scoreHome === activeMatch.scoreAway ? "text-gray-500" :
                                  (activeMatch.scoreHome ?? 0) > (activeMatch.scoreAway ?? 0) ? "text-blue-700" : "text-gray-400"
                                }`}>{activeMatch.scoreHome}</div>
                              </div>
                              <span className="text-2xl font-bold text-gray-300">:</span>
                              <div className="text-center">
                                <div className="text-xs text-red-600 mb-1">{clanwar.awayClanName}</div>
                                <div className={`text-3xl font-black ${
                                  activeMatch.scoreHome === activeMatch.scoreAway ? "text-gray-500" :
                                  (activeMatch.scoreAway ?? 0) > (activeMatch.scoreHome ?? 0) ? "text-red-700" : "text-gray-400"
                                }`}>{activeMatch.scoreAway}</div>
                              </div>
                            </div>
                            {activeMatch.scoreHome === activeMatch.scoreAway && (
                              <div className="text-center text-sm font-semibold mb-3 py-2 rounded-lg text-amber-600 bg-amber-50">
                                {isLastMatch
                                  ? "동점 — 확정 시 클전이 무승부로 종료됩니다"
                                  : "동점 — 확정 시 양쪽 모두 다음 참가자로 교체됩니다"}
                              </div>
                            )}
                            {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditScore(activeMatch.scoreHome ?? 0, activeMatch.scoreAway ?? 0, activeMatch.broadcastUrl)}
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
                                <label className="block text-xs font-medium text-blue-600 mb-1 text-center">
                                  {clanwar.homeClanName} 점수
                                </label>
                                <input
                                  type="number" min={0} value={scoreHome}
                                  onChange={(e) => setScoreHome(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <span className="text-gray-400 font-bold text-xl mt-4">:</span>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-red-600 mb-1 text-center">
                                  {clanwar.awayClanName} 점수
                                </label>
                                <input
                                  type="number" min={0} value={scoreAway}
                                  onChange={(e) => setScoreAway(e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                              </div>
                            </div>
                            <input
                              type="text"
                              value={broadcastUrl}
                              onChange={(e) => setBroadcastUrl(e.target.value)}
                              placeholder="방송 링크 (선택, 예: 유튜브 URL)"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
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
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 일반매치: 고정 대진 리스트 */}
            {gameMode === "normalMatch" && (
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-blue-900">대진표</h3>
                  <span className="text-xs text-blue-700 font-medium">
                    {clanwar.homeClanName} {normalTally.homeWins} : {normalTally.awayWins} {clanwar.awayClanName}
                    <span className="text-gray-400"> (무 {normalTally.draws})</span>
                  </span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {Array.from({ length: Math.min(home.length, away.length) }).map((_, idx) => {
                    const donePair = idx < completedMatches.length ? completedMatches[idx] : null;
                    const activePair = activeMatch && activeMatch.matchIndex === idx ? activeMatch : null;
                    const homeP = home[idx];
                    const awayP = away[idx];
                    return (
                      <li key={idx} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs text-gray-400 w-5 text-right shrink-0">{idx + 1}</span>
                          <span className={`text-sm font-medium truncate ${
                            donePair?.result === "home" ? "text-blue-700" : "text-gray-700"
                          }`}>
                            <ParticipantName p={homeP} />
                          </span>
                          <span className="text-xs text-gray-300 shrink-0">vs</span>
                          <span className={`text-sm font-medium truncate ${
                            donePair?.result === "away" ? "text-red-700" : "text-gray-700"
                          }`}>
                            <ParticipantName p={awayP} />
                          </span>
                        </div>
                        <div className="shrink-0">
                          {donePair ? (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              donePair.result === "home" ? "text-blue-600 bg-blue-50"
                              : donePair.result === "away" ? "text-red-600 bg-red-50"
                              : "text-gray-500 bg-gray-100"
                            }`}>
                              {donePair.result === "home" ? "홈승" : donePair.result === "away" ? "원정승" : "무"}
                            </span>
                          ) : activePair && isManager ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleSubmitResult(activePair._id, "home")}
                                disabled={resultSubmitting}
                                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold disabled:opacity-50"
                              >홈 승</button>
                              <button
                                onClick={() => handleSubmitResult(activePair._id, "draw")}
                                disabled={resultSubmitting}
                                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-semibold disabled:opacity-50"
                              >무</button>
                              <button
                                onClick={() => handleSubmitResult(activePair._id, "away")}
                                disabled={resultSubmitting}
                                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-semibold disabled:opacity-50"
                              >원정 승</button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">대기</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {isManager && activeMatch && (
                  <div className="px-5 py-3 border-t border-gray-100">
                    <input
                      type="text"
                      value={normalBroadcastUrl}
                      onChange={(e) => setNormalBroadcastUrl(e.target.value)}
                      placeholder="방송 링크 (선택, 예: 유튜브 URL) — 결과 선택 시 함께 저장됩니다"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
                {resultError && <p className="text-xs text-red-500 text-center px-4 py-2">{resultError}</p>}
                <div className="px-5 py-3 flex justify-end">{renderResetButton()}</div>
              </div>
            )}

            {/* 데스매치 팀 현황 (일반매치는 위 대진표가 그 역할을 겸함) */}
            {gameMode === "deathmatch" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">팀 현황</h3>
                </div>
                <div className="px-5 py-4 space-y-5">
                  {renderRosterSide("home", home, clanwar.homeClanName, "text-blue-700")}
                  {renderRosterSide("away", away, clanwar.awayClanName, "text-red-700")}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── done ── */}
        {status === "done" && (
          <div className={`rounded-xl px-6 py-8 text-center shadow-sm border ${
            gameMode === "deathmatch" && clanwar.winnerSide === "home" ? "bg-blue-50 border-blue-200"
              : gameMode === "deathmatch" && clanwar.winnerSide === "away" ? "bg-red-50 border-red-200"
              : "bg-gray-50 border-gray-200"
          }`}>
            {gameMode === "deathmatch" && (clanwar.winnerSide === "home" || clanwar.winnerSide === "away") ? (
              <>
                <div className="text-5xl mb-3">🎉</div>
                <h2 className={`text-2xl font-black mb-1 ${
                  clanwar.winnerSide === "home" ? "text-blue-700" : "text-red-700"
                }`}>
                  {clanwar.winnerSide === "home" ? clanwar.homeClanName : clanwar.awayClanName} 승리!
                </h2>
                <p className="text-sm text-gray-500 mb-4">총 {completedMatches.length}경기</p>
              </>
            ) : gameMode === "deathmatch" && clanwar.winnerSide === "draw" ? (
              <>
                <div className="text-4xl mb-3">🤝</div>
                <h2 className="text-xl font-black text-gray-800 mb-1">무승부</h2>
                <p className="text-sm text-gray-500 mb-4">
                  총 {completedMatches.length}경기 · 마지막 경기 동점으로 종료
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">🏁</div>
                <h2 className="text-xl font-black text-gray-800 mb-1">클전 종료</h2>
                <p className="text-sm text-gray-600 mb-4">
                  {clanwar.homeClanName} {normalTally.homeWins} : {normalTally.awayWins} {clanwar.awayClanName}
                  <span className="text-gray-400"> (무 {normalTally.draws})</span>
                </p>
              </>
            )}
            <div className="flex justify-center">{renderResetButton()}</div>
          </div>
        )}

        {/* 경기 기록 */}
        {completedMatches.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">전체 경기 결과</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {completedMatches.map((m, idx) => {
                const homeWon = gameMode === "deathmatch" ? m.winnerParticipantId === m.homeParticipantId : m.result === "home";
                const awayWon = gameMode === "deathmatch" ? m.winnerParticipantId === m.awayParticipantId : m.result === "away";
                const isDraw = !homeWon && !awayWon;
                const isLastRow = idx === completedMatches.length - 1;
                const canEditThisRow = status === "done" ? isManager : isLastRow && canEditLast;
                const isEditingThisRow =
                  status === "done"
                    ? editingMatchId === m._id
                    : isLastRow && (gameMode === "deathmatch" ? editingPrev : editingPrevResult);
                const startEditRow = () => {
                  if (status === "done") startEditDoneRow(m);
                  else if (gameMode === "deathmatch") startEditPrev();
                  else startEditPrevResult();
                };

                if (isEditingThisRow) {
                  return (
                    <li key={m._id} className="px-5 py-4 bg-gray-50/60">
                      <div className="flex items-center gap-1.5 text-sm mb-3">
                        <span className="text-xs text-gray-400 w-5 text-right shrink-0">{idx + 1}</span>
                        <span className="font-medium text-gray-700 truncate">{m.home && <ParticipantName p={m.home} />}</span>
                        <span className="text-xs text-gray-300 shrink-0">vs</span>
                        <span className="font-medium text-gray-700 truncate">{m.away && <ParticipantName p={m.away} />}</span>
                      </div>

                      {status === "done" ? (
                        gameMode === "deathmatch" ? (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <input
                                type="number" min={0} value={editRowScoreHome}
                                onChange={(e) => setEditRowScoreHome(e.target.value)}
                                className="w-14 rounded-lg border border-gray-300 px-1 py-1.5 text-center text-sm font-bold outline-none focus:border-blue-500"
                              />
                              <span className="text-gray-400 font-bold">:</span>
                              <input
                                type="number" min={0} value={editRowScoreAway}
                                onChange={(e) => setEditRowScoreAway(e.target.value)}
                                className="w-14 rounded-lg border border-gray-300 px-1 py-1.5 text-center text-sm font-bold outline-none focus:border-blue-500"
                              />
                            </div>
                            <input
                              type="text"
                              value={editRowBroadcastUrl}
                              onChange={(e) => setEditRowBroadcastUrl(e.target.value)}
                              placeholder="방송 링크 (선택, 예: 유튜브 URL)"
                              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            {editRowError && <p className="text-xs text-red-500 mb-2">{editRowError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setEditingMatchId(null); setEditRowError(null); }}
                                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                              >취소</button>
                              <button
                                onClick={handleSaveDoneScore}
                                disabled={editRowSaving}
                                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >{editRowSaving ? "저장 중..." : "저장"}</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={editRowBroadcastUrl}
                              onChange={(e) => setEditRowBroadcastUrl(e.target.value)}
                              placeholder="방송 링크 (선택, 예: 유튜브 URL) — 아래 버튼 클릭 시 함께 저장됩니다"
                              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            {editRowError && <p className="text-xs text-red-500 mb-2">{editRowError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveDoneResult("home")}
                                disabled={editRowSaving}
                                className="flex-1 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                              >홈 승</button>
                              <button
                                onClick={() => handleSaveDoneResult("draw")}
                                disabled={editRowSaving}
                                className="flex-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                              >무</button>
                              <button
                                onClick={() => handleSaveDoneResult("away")}
                                disabled={editRowSaving}
                                className="flex-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                              >원정 승</button>
                            </div>
                            <button
                              onClick={() => { setEditingMatchId(null); setEditRowError(null); }}
                              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                            >취소</button>
                          </>
                        )
                      ) : gameMode === "deathmatch" ? (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            <input
                              type="number" min={0} value={prevScoreHome}
                              onChange={(e) => setPrevScoreHome(e.target.value)}
                              className="w-14 rounded-lg border border-gray-300 px-1 py-1.5 text-center text-sm font-bold outline-none focus:border-blue-500"
                            />
                            <span className="text-gray-400 font-bold">:</span>
                            <input
                              type="number" min={0} value={prevScoreAway}
                              onChange={(e) => setPrevScoreAway(e.target.value)}
                              className="w-14 rounded-lg border border-gray-300 px-1 py-1.5 text-center text-sm font-bold outline-none focus:border-blue-500"
                            />
                          </div>
                          <input
                            type="text"
                            value={prevBroadcastUrl}
                            onChange={(e) => setPrevBroadcastUrl(e.target.value)}
                            placeholder="방송 링크 (선택, 예: 유튜브 URL)"
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          {prevError && <p className="text-xs text-red-500 mb-2">{prevError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditingPrev(false); setPrevError(null); }}
                              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                            >취소</button>
                            <button
                              onClick={handleSavePrevMatch}
                              disabled={prevSaving}
                              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >{prevSaving ? "저장 중..." : "저장"}</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={prevResultBroadcastUrl}
                            onChange={(e) => setPrevResultBroadcastUrl(e.target.value)}
                            placeholder="방송 링크 (선택, 예: 유튜브 URL) — 아래 버튼 클릭 시 함께 저장됩니다"
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm mb-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditPrevResult("home")}
                              disabled={prevResultSaving}
                              className="flex-1 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                            >홈 승</button>
                            <button
                              onClick={() => handleEditPrevResult("draw")}
                              disabled={prevResultSaving}
                              className="flex-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                            >무</button>
                            <button
                              onClick={() => handleEditPrevResult("away")}
                              disabled={prevResultSaving}
                              className="flex-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >원정 승</button>
                          </div>
                          <button
                            onClick={() => setEditingPrevResult(false)}
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >취소</button>
                        </>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={m._id} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5 text-right shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5 text-sm">
                      <span className={`truncate font-medium ${homeWon ? "text-blue-700" : isDraw ? "text-gray-500" : "text-gray-400"}`}>
                        {m.home && <ParticipantName p={m.home} />}
                      </span>
                      <span className="text-xs text-gray-300 shrink-0">vs</span>
                      <span className={`truncate font-medium ${awayWon ? "text-red-700" : isDraw ? "text-gray-500" : "text-gray-400"}`}>
                        {m.away && <ParticipantName p={m.away} />}
                      </span>
                    </div>
                    {gameMode === "deathmatch" && (
                      <span className="text-sm font-bold text-gray-900 shrink-0">{m.scoreHome} : {m.scoreAway}</span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {homeWon ? (
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">홈승</span>
                      ) : awayWon ? (
                        <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">원정승</span>
                      ) : (
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {gameMode === "deathmatch" ? "동반탈락" : "무"}
                        </span>
                      )}
                      <BroadcastLink url={m.broadcastUrl} />
                      {canEditThisRow && (
                        <button
                          onClick={startEditRow}
                          title="수정"
                          className="ml-0.5 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 text-xs"
                        >✎</button>
                      )}
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
