"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

type FormState = {
  year: number;
  month: number;
  day: number;
  name: string;
  teamAssignPermission: "admin" | "all";
};

const defaultForm = (): FormState => ({
  year: currentYear,
  month: new Date().getMonth() + 1,
  day: new Date().getDate(),
  name: "발스내전",
  teamAssignPermission: "admin",
});

const STATUS_LABEL: Record<string, string> = {
  draft: "팀 배정 전",
  teamAssigned: "팀 배정 완료",
  inProgress: "경기 중",
  done: "완료",
};

export default function InnerwarsPage() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const pageData = useQuery(api.innerwars.getInnerwarsPageData);
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (isSignedIn && pageData !== undefined && pageData !== null && pageData.user === null) {
      upsertUser();
    }
  }, [isSignedIn, pageData, upsertUser]);

  const createInnerwar = useMutation(api.innerwars.create);
  const updateInnerwar = useMutation(api.innerwars.update);
  const removeInnerwar = useMutation(api.innerwars.remove);
  const joinInnerwar = useMutation(api.innerwars.join);
  const leaveInnerwar = useMutation(api.innerwars.leave);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"innerwars"> | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const currentUser = pageData?.user ?? null;
  const innerwars = useMemo(() => pageData?.innerwars ?? [], [pageData]);
  const myParticipations = useMemo(() => pageData?.participations ?? [], [pageData]);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";

  const participationMap = useMemo(() => {
    const map = new Map<string, "pending" | "approved">();
    for (const p of myParticipations) {
      map.set(p.innerwarId, p.status ?? "approved");
    }
    return map;
  }, [myParticipations]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setShowModal(true);
  }

  function openEdit(w: {
    _id: Id<"innerwars">;
    year: number;
    month: number;
    day: number;
    name: string;
    teamAssignPermission?: "admin" | "all";
  }) {
    setEditingId(w._id);
    setForm({
      year: w.year,
      month: w.month,
      day: w.day,
      name: w.name,
      teamAssignPermission: w.teamAssignPermission ?? "admin",
    });
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
        await updateInnerwar({ id: editingId, ...form });
      } else {
        await createInnerwar(form);
      }
      closeModal();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: Id<"innerwars">) {
    if (!confirm("이 내전을 삭제할까요?")) return;
    await removeInnerwar({ id });
  }

  async function handleJoin(innerwarId: Id<"innerwars">) {
    setJoiningId(innerwarId);
    try {
      await joinInnerwar({ innerwarId });
    } finally {
      setJoiningId(null);
    }
  }

  async function handleLeave(innerwarId: Id<"innerwars">) {
    if (!confirm("참가 신청을 취소할까요?")) return;
    setJoiningId(innerwarId);
    try {
      await leaveInnerwar({ innerwarId });
    } finally {
      setJoiningId(null);
    }
  }

  const sorted = [...innerwars].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    return b.day - a.day;
  });

  const availableYears = useMemo(() => {
    const years = new Set(innerwars.map((w) => w.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [innerwars]);

  const effectiveYear = selectedYear !== null ? selectedYear : (availableYears[0] ? String(availableYears[0]) : "");

  const filtered = useMemo(() => {
    if (!effectiveYear) return sorted;
    return sorted.filter((w) => w.year === Number(effectiveYear));
  }, [sorted, effectiveYear]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">발스리그</h1>
          <nav className="flex items-center gap-1">
            <Link
              href="/leagues"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              리그
            </Link>
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              내전
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
            </span>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">내전 목록</h2>
          {isManager && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + 내전 추가
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
              내전 목록을 이용하려면 프로필을 한 번 저장해야 합니다.
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
                <p className="text-4xl mb-3">⚔️</p>
                <p className="text-base font-medium">등록된 내전이 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filtered.map((w) => {
                  const status = participationMap.get(w._id);
                  const isApproved = status === "approved";
                  const isProcessing = joiningId === w._id;

                  return (
                    <li
                      key={w._id}
                      className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <Link href={`/innerwars/${w._id}`} className="hover:opacity-70 transition-opacity">
                          <InnerwarLabel innerwar={w} />
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          {w.status && w.status !== "draft" && (
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                              w.status === "done"
                                ? "bg-gray-100 text-gray-600"
                                : w.status === "inProgress"
                                  ? "bg-orange-50 text-orange-600"
                                  : "bg-green-50 text-green-600"
                            }`}>
                              {STATUS_LABEL[w.status]}
                            </span>
                          )}
                          {w.teamAssignPermission === "all" && (
                            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                              전체 참여
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {!isApproved && (
                          <button
                            onClick={() => handleJoin(w._id)}
                            disabled={isProcessing}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isProcessing ? "처리 중..." : "참가 신청"}
                          </button>
                        )}
                        {isApproved && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                              참가 중
                            </span>
                            <button
                              onClick={() => handleLeave(w._id)}
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
                              onClick={() => openEdit(w)}
                              className="text-sm text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(w._id)}
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
              {editingId ? "내전 수정" : "내전 추가"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
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
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">내전명</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="내전 이름을 입력하세요"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* 4-3: 팀 배정 권한 설정 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">팀 배정 권한</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="teamAssignPermission"
                      value="admin"
                      checked={form.teamAssignPermission === "admin"}
                      onChange={() => setForm({ ...form, teamAssignPermission: "admin" })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">관리자만</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="teamAssignPermission"
                      value="all"
                      checked={form.teamAssignPermission === "all"}
                      onChange={() => setForm({ ...form, teamAssignPermission: "all" })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">모든 사용자</span>
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  팀 배정, 성적기반/랜덤 배정, 초기화 버튼의 실행 권한을 설정합니다.
                  경기 시작은 항상 모든 사용자가 가능합니다.
                </p>
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

function InnerwarLabel({ innerwar }: { innerwar: { year: number; month: number; day: number; name: string } }) {
  return (
    <div>
      <span className="text-xs font-medium text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 mr-2">
        {innerwar.year}.{String(innerwar.month).padStart(2, "0")}.{String(innerwar.day).padStart(2, "0")}
      </span>
      <span className="text-base font-semibold text-gray-900">{innerwar.name}</span>
    </div>
  );
}
