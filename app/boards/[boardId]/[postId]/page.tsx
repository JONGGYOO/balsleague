"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

function displayName(user: { name?: string; nickname?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? "이름 없음";
}

function authorLabel(
  isAnonymous: boolean | undefined,
  author: { name?: string; nickname?: string } | null | undefined,
  isSelf: boolean
): string {
  if (!isAnonymous) return displayName(author);
  if (isSelf) return "익명 (나)";
  if (author) return `${displayName(author)} (관리자만 열람)`;
  return "익명";
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

export default function BoardPostPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.boardId as Id<"boards">;
  const postId = params.postId as Id<"boardPosts">;

  const detail = useQuery(api.boards.getPost, { postId });
  const updatePost = useMutation(api.boards.updatePost);
  const removePost = useMutation(api.boards.removePost);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    if (!detail) return;
    setTitle(detail.post.title);
    setContent(detail.post.content);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updatePost({ id: postId, title, content });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 게시글을 삭제할까요?")) return;
    await removePost({ id: postId });
    router.push(`/boards/${boardId}`);
  }

  if (detail === undefined) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">불러오는 중...</div>;
  }
  if (detail === null) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">게시글을 찾을 수 없습니다.</div>;
  }

  const { post, board, author, isSelf, canEdit } = detail;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/boards/${boardId}`} className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0">
            ← {board.name}
          </Link>
        </div>
        <UserButton />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {!editing ? (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">{post.title}</h1>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-5 pb-4 border-b border-gray-100">
                <span>{authorLabel(board.isAnonymous, author, isSelf)} · {formatDateTime(post._creationTime)}</span>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button onClick={startEdit} className="hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50">
                      수정
                    </button>
                    <button onClick={handleDelete} className="hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                      삭제
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{post.content}</p>
            </>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(false); setError(null); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !title.trim() || !content.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
