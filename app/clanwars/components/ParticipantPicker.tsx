"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMemo, useState } from "react";

type ExistingParticipant = {
  sourceType: "user" | "otherClanUser";
  userId?: Id<"users"> | null;
  otherClanUserId?: Id<"otherClanUsers"> | null;
};

export function ParticipantPicker({
  clanwarId,
  side,
  clanName,
  existingParticipants,
}: {
  clanwarId: Id<"clanwars">;
  side: "home" | "away";
  clanName: string;
  existingParticipants: ExistingParticipant[];
}) {
  const allUsers = useQuery(api.users.listAll);
  const otherClanMembers = useQuery(api.otherClanUsers.list, { organizationName: clanName });
  const addParticipant = useMutation(api.clanwars.addParticipant);

  const usedUserIds = useMemo(
    () => new Set(existingParticipants.filter((p) => p.sourceType === "user").map((p) => p.userId)),
    [existingParticipants]
  );
  const usedOtherClanUserIds = useMemo(
    () =>
      new Set(
        existingParticipants.filter((p) => p.sourceType === "otherClanUser").map((p) => p.otherClanUserId)
      ),
    [existingParticipants]
  );

  const matchingUsers = useMemo(
    () => (allUsers ?? []).filter((u) => u.organization === clanName && !usedUserIds.has(u._id)),
    [allUsers, clanName, usedUserIds]
  );
  const availableOtherClanMembers = useMemo(
    () => (otherClanMembers ?? []).filter((m) => !usedOtherClanUserIds.has(m._id)),
    [otherClanMembers, usedOtherClanUserIds]
  );

  const [tab, setTab] = useState<"user" | "otherClanUser" | null>(null);
  const effectiveTab: "user" | "otherClanUser" =
    tab ?? (matchingUsers.length > 0 ? "user" : "otherClanUser");

  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  const filteredUsers = matchingUsers.filter((u) =>
    (u.nickname ?? u.name ?? "").toLowerCase().includes(search.trim().toLowerCase())
  );
  const filteredOtherClanMembers = availableOtherClanMembers.filter((m) =>
    m.nickname.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function handleAddUser(userId: Id<"users">) {
    setAddingId(userId);
    try {
      await addParticipant({ clanwarId, side, sourceType: "user", userId });
      setSearch("");
    } finally {
      setAddingId(null);
    }
  }

  async function handleAddOtherClanUser(otherClanUserId: Id<"otherClanUsers">) {
    setAddingId(otherClanUserId);
    try {
      await addParticipant({ clanwarId, side, sourceType: "otherClanUser", otherClanUserId });
      setSearch("");
    } finally {
      setAddingId(null);
    }
  }

  if (allUsers === undefined || otherClanMembers === undefined) {
    return <div className="text-xs text-gray-400 py-2">불러오는 중...</div>;
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3 space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTab("user")}
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            effectiveTab === "user" ? "bg-blue-600 text-white" : "text-gray-500 bg-gray-100"
          }`}
        >
          등록 사용자
        </button>
        <button
          type="button"
          onClick={() => setTab("otherClanUser")}
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            effectiveTab === "otherClanUser" ? "bg-blue-600 text-white" : "text-gray-500 bg-gray-100"
          }`}
        >
          타클랜 선수
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="닉네임 검색"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="max-h-48 overflow-y-auto space-y-1">
        {effectiveTab === "user" ? (
          filteredUsers.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">
              {clanName} 소속으로 등록된 사용자가 없습니다.
            </p>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u._id}
                type="button"
                disabled={addingId === u._id}
                onClick={() => handleAddUser(u._id)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-blue-50 disabled:opacity-50"
              >
                <span className="text-gray-800">{u.nickname ?? u.name ?? "이름 없음"}</span>
                <span className="text-xs text-blue-600">+ 추가</span>
              </button>
            ))
          )
        ) : filteredOtherClanMembers.length === 0 ? (
          <p className="text-xs text-gray-400 py-2 text-center">
            {clanName} 소속으로 등록된 타클랜 선수가 없습니다. 관리자 패널 → 타클랜 선수에서
            먼저 등록해주세요.
          </p>
        ) : (
          filteredOtherClanMembers.map((m) => (
            <button
              key={m._id}
              type="button"
              disabled={addingId === m._id}
              onClick={() => handleAddOtherClanUser(m._id)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-blue-50 disabled:opacity-50"
            >
              <span className="text-gray-800">{m.nickname}</span>
              <span className="text-xs text-blue-600">+ 추가</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
