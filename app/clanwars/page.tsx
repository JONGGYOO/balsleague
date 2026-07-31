"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { WinBadge } from "@/app/components/WinBadge";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

type FormState = {
  year: number;
  month: number;
  day: number;
  name: string;
  gameMode: "deathmatch" | "normalMatch";
  homeClanName: string;
  awayClanName: string;
};

const defaultForm = (): FormState => ({
  year: currentYear,
  month: new Date().getMonth() + 1,
  day: new Date().getDate(),
  name: "클랜전",
  gameMode: "deathmatch",
  homeClanName: "",
  awayClanName: "",
});

const STATUS_LABEL: Record<string, string> = {
  draft: "로스터 구성 중",
  inProgress: "경기 중",
  done: "종료",
};

const GAME_MODE_LABEL: Record<string, string> = {
  deathmatch: "데스매치",
  normalMatch: "일반매치",
};

export default function ClanwarsPage() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const pageData = useQuery(api.clanwars.getClanwarsPageData);
  const orgs = useQuery(api.organizations.list);
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (isSignedIn && pageData !== undefined && pageData !== null && pageData.user === null) {
      upsertUser();
    }
  }, [isSignedIn, pageData, upsertUser]);

  const createClanwar = useMutation(api.clanwars.create);
  const updateClanwar = useMutation(api.clanwars.update);
  const removeClanwar = useMutation(api.clanwars.remove);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"clanwars"> | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const currentUser = pageData?.user ?? null;
  const clanwars = useMemo(() => pageData?.clanwars ?? [], [pageData]);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";

  function openCreate() {
    setEditingId(null);
    setFormError(null);
    const firstOrg = orgs?.[0]?.name ?? "";
    setForm({ ...defaultForm(), homeClanName: firstOrg, awayClanName: "" });
    setShowModal(true);
  }

  function openEdit(w: {
    _id: Id<"clanwars">;
    year: number;
    month: number;
    day: number;
    name: string;
    gameMode: "deathmatch" | "normalMatch";
    homeClanName: string;
    awayClanName: string;
  }) {
    setEditingId(w._id);
    setFormError(null);
    setForm({
      year: w.year,
      month: w.month,
      day: w.day,
      name: w.name,
      gameMode: w.gameMode,
      homeClanName: w.homeClanName,
      awayClanName: w.awayClanName,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setFormError(null);
    setForm(defaultForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.homeClanName || !form.awayClanName) return;
    if (form.homeClanName === form.awayClanName) {
      setFormError("홈/어웨이 클랜은 서로 달라야 합니다.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateClanwar({ id: editingId, ...form });
      } else {
        await createClanwar(form);
      }
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: Id<"clanwars">) {
    if (!confirm("이 클랜전을 삭제할까요?")) return;
    await removeClanwar({ id });
  }

  const sorted = [...clanwars].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    return b.day - a.day;
  });

  const availableYears = useMemo(() => {
    const years = new Set(clanwars.map((w) => w.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [clanwars]);

  const effectiveYear = selectedYear !== null ? selectedYear : (availableYears[0] ? String(availableYears[0]) : "");

  const filtered = useMemo(() => {
    if (!effectiveYear) return sorted;
    return sorted.filter((w) => w.year === Number(effectiveYear));
  }, [sorted, effectiveYear]);

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
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              클전
            </span>
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
              Admin
            </Link>
          )}
          {currentUser && (currentUser.nickname || currentUser.name) && (
            <Link
              href="/profile"
              className="text-sm font-medium text-gray-700 hover:text-blue-600"
            >
              {currentUser.nickname ?? currentUser.name}
              <WinBadge wins={currentUser.leagueWins} />
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">클전 목록</h2>
          {isManager && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + 클전 추가
            </button>
          )}
        </div>

        {!clerkLoaded || pageData === undefined ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : pageData === null || pageData.user === null ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : (
          <>
            {availableYears.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
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
                <p className="text-4xl mb-3">🛡️</p>
                <p className="text-base font-medium">등록된 클전이 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filtered.map((w) => (
                  <li
                    key={w._id}
                    className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <Link href={`/clanwars/${w._id}`} className="hover:opacity-70 transition-opacity">
                        <ClanwarLabel clanwar={w} />
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                          {GAME_MODE_LABEL[w.gameMode]}
                        </span>
                        {w.status && (
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                              w.status === "done"
                                ? "bg-gray-100 text-gray-600"
                                : w.status === "inProgress"
                                  ? "bg-orange-50 text-orange-600"
                                  : "bg-green-50 text-green-600"
                            }`}
                          >
                            {STATUS_LABEL[w.status]}
                          </span>
                        )}
                      </div>
                    </div>

                    {isManager && (
                      <div className="flex items-center gap-2 ml-3 shrink-0">
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
                      </div>
                    )}
                  </li>
                ))}
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
              {editingId ? "클전 수정" : "클전 추가"}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">클전명</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="클전 이름을 입력하세요"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">홈 클랜</label>
                  <select
                    value={form.homeClanName}
                    onChange={(e) => setForm({ ...form, homeClanName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">선택</option>
                    {(orgs ?? []).map((org) => (
                      <option key={org._id} value={org.name}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <span className="pb-2.5 text-sm font-semibold text-gray-400">vs</span>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">어웨이 클랜</label>
                  <select
                    value={form.awayClanName}
                    onChange={(e) => setForm({ ...form, awayClanName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">선택</option>
                    {(orgs ?? []).map((org) => (
                      <option key={org._id} value={org.name}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">게임 방식</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gameMode"
                      value="deathmatch"
                      checked={form.gameMode === "deathmatch"}
                      onChange={() => setForm({ ...form, gameMode: "deathmatch" })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">데스매치</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gameMode"
                      value="normalMatch"
                      checked={form.gameMode === "normalMatch"}
                      onChange={() => setForm({ ...form, gameMode: "normalMatch" })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">일반매치</span>
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  데스매치는 이긴 쪽이 자리를 지키고 진 쪽만 다음 선수로 교체됩니다.
                  일반매치는 순서대로 한 번씩 붙어 승/무/패만 바로 기록합니다.
                </p>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

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
                  disabled={submitting || !form.name.trim() || !form.homeClanName || !form.awayClanName}
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

function ClanwarLabel({
  clanwar,
}: {
  clanwar: { year: number; month: number; day: number; name: string; homeClanName: string; awayClanName: string };
}) {
  return (
    <div>
      <span className="text-xs font-medium text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 mr-2">
        {clanwar.year}.{String(clanwar.month).padStart(2, "0")}.{String(clanwar.day).padStart(2, "0")}
      </span>
      <span className="text-base font-semibold text-gray-900">{clanwar.name}</span>
      <div className="text-sm text-gray-500 mt-0.5">
        {clanwar.homeClanName} <span className="text-gray-400">vs</span> {clanwar.awayClanName}
      </div>
    </div>
  );
}
