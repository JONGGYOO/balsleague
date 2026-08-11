"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function BoardDetailPage() {
  const params = useParams();
  const boardId = params.boardId as Id<"boards">;

  const detail = useQuery(api.boards.getBoardDetail, { boardId });
  const createPost = useMutation(api.boards.createPost);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createPost({ boardId, title, content });
      setTitle("");
      setContent("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (detail === undefined) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">불러오는 중...</div>;
  }
  if (detail === null) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">게시판을 찾을 수 없습니다.</div>;
  }

  const { board, posts, canWrite } = detail;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/boards" className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0">
            ← 게시판 목록
          </Link>
          <span className="text-lg font-bold text-gray-900 truncate">{board.name}</span>
        </div>
        <UserButton />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {board.description && (
          <p className="text-sm text-gray-500">{board.description}</p>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">게시글 {posts.length}개</h2>
          {canWrite && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + 글쓰기
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim() || !content.trim()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        )}

        {posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">✏️</p>
            <p className="text-base font-medium">등록된 게시글이 없습니다.</p>
          </div>
        ) : (
          <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {posts.map((p) => (
              <li key={p._id}>
                <Link
                  href={`/boards/${boardId}/${p._id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900 truncate">{p.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {displayName(p.author)} · {formatDate(p._creationTime)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
