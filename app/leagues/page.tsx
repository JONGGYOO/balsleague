"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { WinBadge } from "@/app/components/WinBadge";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

type ItemType = "league" | "innerwar";
type FormState = { type: ItemType; year: number; month: number; day: number; name: string };

const defaultForm = (): FormState => ({
  type: "league",
  year: currentYear,
  month: new Date().getMonth() + 1,
  day: new Date().getDate(),
  name: "발스리그",
});

export default function LeaguesPage() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const pageData = useQuery(api.leagues.getLeaguesPageData);
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (isSignedIn && pageData !== undefined && pageData !== null && pageData.user === null) {
      upsertUser();
    }
  }, [isSignedIn, pageData, upsertUser]);

  const createLeague = useMutation(api.leagues.create);
  const updateLeague = useMutation(api.leagues.update);
  const removeLeague = useMutation(api.leagues.remove);
  const joinLeague = useMutation(api.leagues.join);
  const leaveLeague = useMutation(api.leagues.leave);
  const createInnerwar = useMutation(api.innerwars.create);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"leagues"> | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const currentUser = pageData?.user ?? null;
  const leagues = useMemo(() => pageData?.leagues ?? [], [pageData]);
  const myParticipations = useMemo(() => pageData?.participations ?? [], [pageData]);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";

  const participationMap = useMemo(() => {
    const map = new Map<string, "pending" | "approved">();
    for (const p of myParticipations) {
      map.set(p.leagueId, p.status ?? "approved");
    }
    return map;
  }, [myParticipations]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setShowModal(true);
  }

  function openEdit(league: { _id: Id<"leagues">; year: number; month: number; name: string }) {
    setEditingId(league._id);
    setForm({ type: "league", year: league.year, month: league.month, day: 1, name: league.name });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(defaultForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateLeague({ id: editingId, year: form.year, month: form.month, name: form.name });
        closeModal();
      } else if (form.type === "innerwar") {
        await createInnerwar({ year: form.year, month: form.month, day: form.day, name: form.name });
        closeModal();
        router.push("/innerwars");
      } else {
        await createLeague({ year: form.year, month: form.month, name: form.name });
        closeModal();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: Id<"leagues">) {
    if (!confirm("이 리그를 삭제할까요?\n(기록은 보존되며 관리자가 복원할 수 있습니다)")) return;
    await removeLeague({ id });
  }

  async function handleJoin(leagueId: Id<"leagues">) {
    setJoiningId(leagueId);
    try {
      await joinLeague({ leagueId });
    } finally {
      setJoiningId(null);
    }
  }

  async function handleLeave(leagueId: Id<"leagues">) {
    if (!confirm("참가 신청을 취소할까요?")) return;
    setJoiningId(leagueId);
    try {
      await leaveLeague({ leagueId });
    } finally {
      setJoiningId(null);
    }
  }

  const sorted = [...leagues].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  const availableYears = useMemo(() => {
    const years = new Set(leagues.map((l) => l.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [leagues]);

  const effectiveYear = selectedYear !== null ? selectedYear : (availableYears[0] ? String(availableYears[0]) : "");

  const filtered = useMemo(() => {
    if (!effectiveYear) return sorted;
    return sorted.filter((l) => l.year === Number(effectiveYear));
  }, [sorted, effectiveYear]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1">
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              리그
            </span>
            <Link
              href="/innerwars"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              내전
            </Link>
            <Link
              href="/awards"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              Award
            </Link>
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

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">리그 목록</h2>
            {!isManager && (
              <p className="text-xs text-gray-400 mt-0.5">
                참가 신청 후 관리자 승인이 필요합니다
              </p>
            )}
          </div>
          {isManager && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + 추가
            </button>
          )}
        </div>

        {!clerkLoaded || pageData === undefined ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : pageData === null || (pageData.user === null) ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : currentUser && !currentUser.profileSaved ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center space-y-4">
            <p className="text-4xl">👤</p>
            <h3 className="text-base font-semibold text-gray-800">프로필을 먼저 저장해주세요</h3>
            <p className="text-sm text-gray-500">
              리그 목록을 이용하려면 프로필을 한 번 저장해야 합니다.
            </p>
            <Link
              href="/profile"
              className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              프로필 저장하기
            </Link>
          </div>
        ) : (
          <>
            {availableYears.length > 0 && (
              <div className="mb-4">
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
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">⚽</p>
                <p className="text-base font-medium">등록된 리그가 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filtered.map((league) => {
                  const status = participationMap.get(league._id);
                  const isApproved = status === "approved";
                  const isPending = status === "pending";
                  const canNavigate = isManager || isApproved;
                  const isProcessing = joiningId === league._id;

                  return (
                    <li
                      key={league._id}
                      className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex-1 min-w-0">
                        {canNavigate ? (
                          <Link
                            href={`/leagues/${league._id}`}
                            className="hover:opacity-70 transition-opacity"
                          >
                            <LeagueLabel league={league} />
                          </Link>
                        ) : (
                          <LeagueLabel league={league} />
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {!isApproved && !isPending && (
                          <button
                            onClick={() => handleJoin(league._id)}
                            disabled={isProcessing}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isProcessing ? "처리 중..." : "참가 신청"}
                          </button>
                        )}
                        {isPending && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                              승인 대기 중
                            </span>
                            <button
                              onClick={() => handleLeave(league._id)}
                              disabled={isProcessing}
                              className="text-xs text-gray-400 hover:text-red-500"
                            >
                              취소
                            </button>
                          </div>
                        )}
                        {isApproved && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                              참가 중
                            </span>
                            <button
                              onClick={() => handleLeave(league._id)}
                              disabled={isProcessing}
                              className="text-xs text-gray-400 hover:text-red-500"
                            >
                              취소
                            </button>
                          </div>
                        )}

                        {isManager && (
                          <>
                            <button
                              onClick={() => openEdit(league)}
                              className="text-sm text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(league._id)}
                              className="text-sm text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      {showModal && isManager && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-5">
              {editingId ? "리그 수정" : form.type === "innerwar" ? "내전 추가" : "리그 추가"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 구분 선택 (신규 추가 시에만) */}
              {!editingId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">구분</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="league">리그</option>
                    <option value="innerwar">내전</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">년도</label>
                  <select
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">월</label>
                  <select
                    value={form.month}
                    onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
                {/* 내전일 때 일(day) 추가 */}
                {form.type === "innerwar" && !editingId && (
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">일</label>
                    <select
                      value={form.day}
                      onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      {DAYS.map((d) => <option key={d} value={d}>{d}일</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {form.type === "innerwar" && !editingId ? "내전명" : "리그명"}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={form.type === "innerwar" && !editingId ? "내전 이름을 입력하세요" : "리그 이름을 입력하세요"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "저장 중..." : editingId ? "수정" : "추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LeagueLabel({ league }: { league: { year: number; month: number; name: string } }) {
  return (
    <>
      <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2 py-0.5 mr-2">
        {league.year}년 {league.month}월
      </span>
      <span className="text-base font-semibold text-gray-900">{league.name}</span>
    </>
  );
}
