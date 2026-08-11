"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { WinBadge } from "@/app/components/WinBadge";

type WritePermission = "superAdmin" | "admin" | "user";

const WRITE_PERMISSION_LABEL: Record<WritePermission, string> = {
  superAdmin: "슈퍼관리자만",
  admin: "관리자 이상",
  user: "전체 사용자",
};

type FormState = {
  name: string;
  description: string;
  writePermission: WritePermission;
  isAnonymous: boolean;
  isNotice: boolean;
};

const defaultForm = (): FormState => ({
  name: "",
  description: "",
  writePermission: "user",
  isAnonymous: false,
  isNotice: false,
});

export default function BoardsPage() {
  const data = useQuery(api.boards.listBoards);
  const currentUser = useQuery(api.users.getCurrentUser);
  const createBoard = useMutation(api.boards.createBoard);
  const updateBoard = useMutation(api.boards.updateBoard);
  const removeBoard = useMutation(api.boards.removeBoard);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"boards"> | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveRole = currentUser?.effectiveRole ?? "user";
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(b: {
    _id: Id<"boards">;
    name: string;
    description?: string;
    writePermission: WritePermission;
    isAnonymous?: boolean;
    isNotice?: boolean;
  }) {
    setEditingId(b._id);
    setForm({
      name: b.name,
      description: b.description ?? "",
      writePermission: b.writePermission,
      isAnonymous: b.isAnonymous ?? false,
      isNotice: b.isNotice ?? false,
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(defaultForm());
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description.trim() || undefined,
        writePermission: form.writePermission,
        isAnonymous: form.isAnonymous,
        isNotice: form.isNotice,
      };
      if (editingId) {
        await updateBoard({ id: editingId, ...payload });
      } else {
        await createBoard(payload);
      }
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: Id<"boards">) {
    if (!confirm("이 게시판을 삭제할까요? (기존 게시글은 더 이상 보이지 않게 됩니다)")) return;
    await removeBoard({ id });
  }

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
            <Link
              href="/clanwars"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              클전
            </Link>
            <Link
              href="/awards"
              className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              Award
            </Link>
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              게시판
            </span>
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
            <Link href="/profile" className="text-sm font-medium text-gray-700 hover:text-blue-600">
              {currentUser.nickname ?? currentUser.name}
              <WinBadge wins={currentUser.leagueWins} />
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">게시판</h2>
          {isManager && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + 게시판 추가
            </button>
          )}
        </div>

        {data === undefined ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : data === null ? (
          <div className="text-center py-16 text-gray-400">로그인이 필요합니다.</div>
        ) : data.boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-base font-medium">등록된 게시판이 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.boards.map((b) => (
              <li
                key={b._id}
                className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm"
              >
                <Link href={`/boards/${b._id}`} className="flex-1 min-w-0 hover:opacity-70 transition-opacity">
                  <div className="flex items-center gap-2">
                    {b.isNotice && (
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                        📌 공지
                      </span>
                    )}
                    <span className="text-base font-semibold text-gray-900">{b.name}</span>
                    <span className="text-xs text-gray-400">게시글 {b.postCount}개</span>
                  </div>
                  {b.description && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{b.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="inline-block text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                      작성 권한: {WRITE_PERMISSION_LABEL[b.writePermission]}
                    </span>
                    {b.isAnonymous && (
                      <span className="inline-block text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        🕶️ 익명
                      </span>
                    )}
                  </div>
                </Link>

                {isManager && (
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => openEdit(b)}
                      className="text-sm text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(b._id)}
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
      </main>

      {showModal && isManager && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-5">
              {editingId ? "게시판 수정" : "게시판 추가"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">게시판 이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="예: 자유게시판, 공지사항"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">설명</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="이 게시판의 용도를 간단히 설명해주세요"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAnonymous}
                    onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">익명 게시판</span>
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  체크하면 글쓴이 닉네임 대신 &ldquo;익명&rdquo;으로 표시됩니다. 관리자와 글쓴이 본인에게는
                  계속 실제 닉네임이 보입니다.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isNotice}
                    onChange={(e) => setForm({ ...form, isNotice: e.target.checked })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">📌 공지사항 게시판</span>
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  체크하면 이 게시판이 목록 맨 위에 고정됩니다. 공지사항 게시판이 여러 개면 만든
                  순서대로 정렬됩니다.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">작성 권한</label>
                <div className="flex flex-col gap-2">
                  {(["user", "admin", "superAdmin"] as WritePermission[]).map((perm) => (
                    <label key={perm} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="writePermission"
                        value={perm}
                        checked={form.writePermission === perm}
                        onChange={() => setForm({ ...form, writePermission: perm })}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">{WRITE_PERMISSION_LABEL[perm]}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  글쓰기가 가능한 최소 등급입니다. 내전관리자는 전체 사용자 등급에 포함됩니다. 읽기는
                  로그인한 모든 사용자에게 항상 공개됩니다.
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
