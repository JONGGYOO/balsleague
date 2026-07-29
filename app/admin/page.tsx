"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WinBadge } from "@/app/components/WinBadge";

function displayName(user: { name?: string; nickname?: string; email?: string } | null | undefined): string {
  if (!user) return "알 수 없음";
  return user.nickname ?? user.name ?? user.email ?? "이름 없음";
}

type Tab = "participants" | "clans" | "otherClanUsers" | "users" | "deleted";

export default function AdminPage() {
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);

  const effectiveRole = currentUser?.effectiveRole ?? null;
  const isManager = effectiveRole === "superAdmin" || effectiveRole === "admin";
  const isSuperAdmin = effectiveRole === "superAdmin";

  const [activeTab, setActiveTab] = useState<Tab>("participants");

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!isManager) router.replace("/leagues");
  }, [currentUser, isManager, router]);

  if (currentUser === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        불러오는 중...
      </div>
    );
  }

  if (!isManager) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/leagues" className="text-gray-500 hover:text-gray-800 text-sm font-medium">
            ← 목록
          </Link>
          <h1 className="text-xl font-bold text-gray-900">관리자 패널</h1>
          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            {isSuperAdmin ? "슈퍼관리자" : "관리자"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          <TabButton active={activeTab === "participants"} onClick={() => setActiveTab("participants")}>
            참가 승인 대기
          </TabButton>
          <TabButton active={activeTab === "clans"} onClick={() => setActiveTab("clans")}>
            클랜 관리
          </TabButton>
          <TabButton active={activeTab === "otherClanUsers"} onClick={() => setActiveTab("otherClanUsers")}>
            타클랜 사용자
          </TabButton>
          {isManager && (
            <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>
              사용자 역할
            </TabButton>
          )}
          {isSuperAdmin && (
            <TabButton active={activeTab === "deleted"} onClick={() => setActiveTab("deleted")}>
              삭제된 리그
            </TabButton>
          )}
        </div>

        {activeTab === "participants" && <PendingParticipants />}
        {activeTab === "clans" && <ClanManagement />}
        {activeTab === "otherClanUsers" && <OtherClanUserManagement />}
        {activeTab === "users" && isManager && <UserManagement isSuperAdmin={isSuperAdmin} />}
        {activeTab === "deleted" && isSuperAdmin && <DeletedLeagues />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function PendingParticipants() {
  const pendingList = useQuery(api.leagues.getPendingParticipants);
  const approveParticipant = useMutation(api.leagues.approveParticipant);
  const rejectParticipant = useMutation(api.leagues.rejectParticipant);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleApprove(id: Id<"leagueParticipants">) {
    setProcessingId(id);
    try { await approveParticipant({ participantId: id }); }
    finally { setProcessingId(null); }
  }

  async function handleReject(id: Id<"leagueParticipants">) {
    if (!confirm("이 신청을 거절할까요?")) return;
    setProcessingId(id);
    try { await rejectParticipant({ participantId: id }); }
    finally { setProcessingId(null); }
  }

  if (pendingList === undefined) {
    return <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>;
  }

  if (pendingList.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-3xl mb-2">✓</p>
        <p className="text-sm font-medium">대기 중인 참가 신청이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        총 <strong>{pendingList.length}건</strong>의 참가 신청이 승인 대기 중입니다.
      </p>
      {pendingList.map((item) => {
        const isProcessing = processingId === item._id;
        return (
          <div
            key={item._id}
            className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm"
          >
            <div>
              <p className="font-semibold text-gray-900">
                {displayName(item.user)}
                <WinBadge wins={item.user?.leagueWins} />
                {item.user?.organization && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {item.user.organization}
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.league
                  ? `${item.league.year}년 ${item.league.month}월 · ${item.league.name}`
                  : "알 수 없는 리그"}
              </p>
              {item.user?.email && (
                <p className="text-xs text-gray-300 mt-0.5">{item.user.email}</p>
              )}
            </div>
            <div className="flex gap-2 ml-4 shrink-0">
              <button
                onClick={() => handleApprove(item._id)}
                disabled={isProcessing}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isProcessing ? "처리 중..." : "승인"}
              </button>
              <button
                onClick={() => handleReject(item._id)}
                disabled={isProcessing}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                거절
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClanManagement() {
  const orgs = useQuery(api.organizations.list);
  const addOrg = useMutation(api.organizations.add);
  const removeOrg = useMutation(api.organizations.remove);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await addOrg({ name: newName.trim() });
      setNewName("");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: Id<"organizations">) {
    if (!confirm("이 클랜을 삭제할까요?")) return;
    await removeOrg({ id });
  }

  if (orgs === undefined) {
    return <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">프로필의 클랜소속 선택 목록을 관리합니다.</p>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="클랜명 입력"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? "추가 중..." : "+ 추가"}
        </button>
      </form>

      {orgs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">등록된 클랜이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <div
              key={org._id}
              className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm"
            >
              <span className="font-medium text-gray-900">{org.name}</span>
              <button
                onClick={() => handleRemove(org._id)}
                className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SKILL_TIER_LABEL: Record<string, string> = {
  god: "초고수",
  high: "고수",
  mid: "중수",
  low: "하수",
};

function OtherClanUserManagement() {
  const orgs = useQuery(api.organizations.list);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const effectiveOrg = selectedOrg !== null ? selectedOrg : (orgs?.[0]?.name ?? "");
  const members = useQuery(
    api.otherClanUsers.list,
    effectiveOrg ? { organizationName: effectiveOrg } : "skip"
  );
  const createMember = useMutation(api.otherClanUsers.create);
  const removeMember = useMutation(api.otherClanUsers.remove);

  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [previousNickname, setPreviousNickname] = useState("");
  const [skillTier, setSkillTier] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveOrg || !nickname.trim()) return;
    setSubmitting(true);
    try {
      await createMember({
        organizationName: effectiveOrg,
        nickname: nickname.trim(),
        name: name.trim() || undefined,
        previousNickname: previousNickname.trim() || undefined,
        skillTier: skillTier ? (skillTier as "god" | "high" | "mid" | "low") : undefined,
        memo: memo.trim() || undefined,
      });
      setNickname("");
      setName("");
      setPreviousNickname("");
      setSkillTier("");
      setMemo("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: Id<"otherClanUsers">) {
    if (!confirm("이 사용자를 삭제할까요?")) return;
    await removeMember({ id });
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (orgs === undefined) {
    return <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>;
  }

  if (orgs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        등록된 클랜이 없습니다. 먼저 클랜 관리에서 클랜을 추가해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        로그인하지 않는 타클랜 인원을 클랜별로 등록해 차후 클랜전 관리에 활용합니다.
      </p>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">클랜</label>
        <select
          value={effectiveOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          className={inputClass}
        >
          {orgs.map((org) => (
            <option key={org._id} value={org.name}>{org.name}</option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              닉네임 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">이전 닉네임</label>
            <input
              type="text"
              value={previousNickname}
              onChange={(e) => setPreviousNickname(e.target.value)}
              placeholder="이전 닉네임"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">실력 평가</label>
            <select
              value={skillTier}
              onChange={(e) => setSkillTier(e.target.value)}
              className={inputClass}
            >
              <option value="">선택 안 함</option>
              <option value="god">초고수</option>
              <option value="high">고수</option>
              <option value="mid">중수</option>
              <option value="low">하수</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">기타</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="기타 참고 사항"
            rows={2}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !effectiveOrg || !nickname.trim()}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "+ 등록"}
        </button>
      </form>

      {members === undefined ? (
        <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">등록된 타클랜 사용자가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m._id}
              className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">
                  {m.nickname}
                  {m.name && <span className="ml-1.5 text-sm font-normal text-gray-500">({m.name})</span>}
                  {m.skillTier && (
                    <span className="ml-2 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                      {SKILL_TIER_LABEL[m.skillTier]}
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                  {m.previousNickname && <span>이전 닉네임: {m.previousNickname}</span>}
                  {m.memo && <span className="truncate">{m.memo}</span>}
                </div>
              </div>
              <button
                onClick={() => handleRemove(m._id)}
                className="shrink-0 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded ml-3"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  innerwarAdmin: "내전관리자",
  user: "일반 사용자",
};

function UserManagement({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const users = useQuery(api.users.listAll);
  const setRole = useMutation(api.users.setRole);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleRoleChange(userId: Id<"users">, value: string) {
    setProcessingId(userId);
    try {
      await setRole({
        userId,
        role: value === "" ? undefined : (value as "admin" | "innerwarAdmin"),
      });
    } finally {
      setProcessingId(null);
    }
  }

  if (users === undefined) {
    return <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>;
  }

  if (users.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">등록된 사용자가 없습니다.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          총 <strong className="text-gray-900">{users.length}명</strong>의 사용자가 등록되어 있습니다.
        </p>
      </div>
      {users.map((user) => {
        const isSelf = user._id === currentUser?._id;
        const isAdmin = user.role === "admin";
        const isInnerwarAdmin = user.role === "innerwarAdmin";
        const isProcessing = processingId === user._id;

        const birthDate = [user.birthYear, user.birthMonth, user.birthDay]
          .every(Boolean)
          ? `${user.birthYear}.${String(user.birthMonth).padStart(2, "0")}.${String(user.birthDay).padStart(2, "0")}`
          : null;

        return (
          <div
            key={user._id}
            className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">
                    {displayName(user)}
                    <WinBadge wins={user.leagueWins} />
                    {isSelf && <span className="ml-1 text-xs text-blue-500">(나)</span>}
                  </p>
                  {isAdmin ? (
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      관리자
                    </span>
                  ) : isInnerwarAdmin ? (
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                      내전관리자
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      일반 사용자
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  {user.organization && (
                    <span><span className="text-gray-400">클랜</span> {user.organization}</span>
                  )}
                  {user.name && (
                    <span><span className="text-gray-400">이름</span> {user.name}</span>
                  )}
                  {user.nickname && (
                    <span><span className="text-gray-400">닉네임</span> {user.nickname}</span>
                  )}
                  {birthDate && (
                    <span><span className="text-gray-400">생년월일</span> {birthDate}</span>
                  )}
                  {user.phone && (
                    <span><span className="text-gray-400">연락처</span> {user.phone}</span>
                  )}
                  {user.email && (
                    <span className="col-span-2"><span className="text-gray-400">이메일</span> {user.email}</span>
                  )}
                </div>
              </div>
              {isSuperAdmin && !isSelf && (
                <select
                  value={user.role ?? ""}
                  onChange={(e) => handleRoleChange(user._id, e.target.value)}
                  disabled={isProcessing}
                  className="shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{ROLE_LABEL.user}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                  <option value="innerwarAdmin">{ROLE_LABEL.innerwarAdmin}</option>
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeletedLeagues() {
  const deletedLeagues = useQuery(api.leagues.listDeleted);
  const restoreLeague = useMutation(api.leagues.restore);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleRestore(id: Id<"leagues">) {
    if (!confirm("이 리그를 복원할까요?")) return;
    setProcessingId(id);
    try { await restoreLeague({ id }); }
    finally { setProcessingId(null); }
  }

  if (deletedLeagues === undefined) {
    return <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>;
  }

  if (deletedLeagues.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-3xl mb-2">🗑</p>
        <p className="text-sm font-medium">삭제된 리그가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        삭제된 리그를 복원하면 모든 기록(스코어, 참가자)이 다시 활성화됩니다.
      </p>
      {deletedLeagues.map((league) => {
        const isProcessing = processingId === league._id;
        const deletedDate = league.deletedAt
          ? new Date(league.deletedAt).toLocaleDateString("ko-KR")
          : "";

        return (
          <div
            key={league._id}
            className="bg-white rounded-xl border border-red-100 px-5 py-4 flex items-center justify-between shadow-sm"
          >
            <div>
              <p className="font-semibold text-gray-700">
                <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 mr-2">
                  {league.year}년 {league.month}월
                </span>
                {league.name}
              </p>
              {deletedDate && (
                <p className="text-xs text-red-400 mt-0.5">{deletedDate} 삭제됨</p>
              )}
            </div>
            <button
              onClick={() => handleRestore(league._id)}
              disabled={isProcessing}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 ml-4 shrink-0"
            >
              {isProcessing ? "복원 중..." : "복원"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
