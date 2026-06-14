"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

const BIRTH_YEARS = Array.from({ length: 2025 - 1940 + 1 }, (_, i) => 1940 + i);
const BIRTH_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const BIRTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function ProfilePage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const orgs = useQuery(api.organizations.list);
  const upsertUser = useMutation(api.users.upsertUser);
  const updateProfile = useMutation(api.users.updateProfile);

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [organization, setOrganization] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [phoneMid, setPhoneMid] = useState("");
  const [phoneLast, setPhoneLast] = useState("");

  useEffect(() => {
    upsertUser();
  }, [upsertUser]);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setNickname(user.nickname ?? "");
      setOrganization(user.organization ?? "");
      setBirthYear(user.birthYear ? String(user.birthYear) : "");
      setBirthMonth(user.birthMonth ? String(user.birthMonth) : "");
      setBirthDay(user.birthDay ? String(user.birthDay) : "");
      if (user.phone) {
        const parts = user.phone.replace(/^010-/, "").split("-");
        if (parts.length === 2) {
          setPhoneMid(parts[0]);
          setPhoneLast(parts[1]);
        }
      }
    }
  }, [user]);

  const isFormValid = useMemo(() => {
    return (
      name.trim() !== "" &&
      nickname.trim() !== "" &&
      organization !== "" &&
      birthYear !== "" &&
      birthMonth !== "" &&
      birthDay !== "" &&
      phoneMid.length === 4 &&
      phoneLast.length === 4
    );
  }, [name, nickname, organization, birthYear, birthMonth, birthDay, phoneMid, phoneLast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    await updateProfile({
      name: name.trim(),
      nickname: nickname.trim(),
      organization,
      birthYear: parseInt(birthYear),
      birthMonth: parseInt(birthMonth),
      birthDay: parseInt(birthDay),
      phone: `010-${phoneMid}-${phoneLast}`,
    });
    router.back();
  }

  const selectClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white";
  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  const displayLabel =
    user?.nickname && user?.name
      ? `${user.nickname}(${user.name})`
      : user?.nickname ?? user?.name;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/leagues"
              className="text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              ← 홈
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">내 프로필</h1>
          </div>
          <div className="flex items-center gap-2">
            {displayLabel && (
              <span className="text-sm font-medium text-gray-700">{displayLabel}</span>
            )}
            <UserButton />
          </div>
        </div>

        <p className="mb-4 text-xs text-gray-400">* 표시 항목은 필수 입력입니다.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 클랜소속 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              클랜소속 <span className="text-red-500">*</span>
            </label>
            <select
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              required
              className={selectClass}
            >
              <option value="">선택하세요</option>
              {(orgs ?? []).map((org) => (
                <option key={org._id} value={org.name}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* 이름 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              required
              className={inputClass}
            />
          </div>

          {/* 닉네임 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              닉네임 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력하세요"
              required
              className={inputClass}
            />
          </div>

          {/* 생년월일 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              생년월일 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                required
                className={selectClass}
              >
                <option value="">년도</option>
                {BIRTH_YEARS.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <select
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                required
                className={selectClass}
              >
                <option value="">월</option>
                {BIRTH_MONTHS.map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
              <select
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                required
                className={selectClass}
              >
                <option value="">일</option>
                {BIRTH_DAYS.map((d) => (
                  <option key={d} value={d}>{d}일</option>
                ))}
              </select>
            </div>
          </div>

          {/* 핸드폰번호 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              핸드폰번호 <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">
                010
              </span>
              <span className="text-gray-400 text-sm">-</span>
              <input
                type="text"
                value={phoneMid}
                onChange={(e) => setPhoneMid(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                maxLength={4}
                inputMode="numeric"
                required
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-sm">-</span>
              <input
                type="text"
                value={phoneLast}
                onChange={(e) => setPhoneLast(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                maxLength={4}
                inputMode="numeric"
                required
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {(phoneMid.length > 0 || phoneLast.length > 0) &&
              (phoneMid.length < 4 || phoneLast.length < 4) && (
                <p className="mt-1 text-xs text-amber-600">숫자 4자리씩 입력해주세요</p>
              )}
          </div>

          <button
            type="submit"
            disabled={!isFormValid}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            저장
          </button>
        </form>
      </div>
    </div>
  );
}
