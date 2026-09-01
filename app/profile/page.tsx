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

// 요일 표시 순서(월~일)와 실제 저장 값(0=일~6=토, JS Date getUTCDay 기준) 매핑
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토",
};

type DayRow = { day: number; enabled: boolean; startMinute: number; endMinute: number };

function minutesToTimeInput(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function defaultDayRows(): DayRow[] {
  return DAY_ORDER.map((day) => ({ day, enabled: false, startMinute: 20 * 60, endMinute: 23 * 60 }));
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const orgs = useQuery(api.organizations.list);
  const upsertUser = useMutation(api.users.upsertUser);
  const updateProfile = useMutation(api.users.updateProfile);

  const [tab, setTab] = useState<"info" | "schedule">("info");

  const savedSchedule = useQuery(api.gameAvailability.getMine);
  const saveSchedule = useMutation(api.gameAvailability.save);
  const [dayRows, setDayRows] = useState<DayRow[]>(defaultDayRows());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!savedSchedule) return;
    setDayRows(
      DAY_ORDER.map((day) => {
        const found = savedSchedule.find((s) => s.day === day);
        if (!found) return { day, enabled: false, startMinute: 20 * 60, endMinute: 23 * 60 };
        // 서버에는 자정을 넘긴 종료 시간이 1440+ 로 저장되어 있을 수 있어, 입력창 표시용으로 되돌린다
        return { day, enabled: found.enabled, startMinute: found.startMinute, endMinute: found.endMinute % 1440 };
      })
    );
  }, [savedSchedule]);

  async function handleScheduleSave() {
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      await saveSchedule({
        schedule: dayRows.map((row) => ({
          day: row.day,
          enabled: row.enabled,
          startMinute: row.startMinute,
          // 종료 시간이 시작 시간보다 빠르거나 같으면 자정을 넘겨 다음날 새벽까지로 처리
          endMinute: row.endMinute <= row.startMinute ? row.endMinute + 1440 : row.endMinute,
        })),
      });
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setScheduleSaving(false);
    }
  }

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

        <div className="mb-5 flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab("info")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === "info"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            내 정보
          </button>
          <button
            type="button"
            onClick={() => setTab("schedule")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === "schedule"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            게임 가능 시간
          </button>
        </div>

        {tab === "schedule" ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-700">
              요일별로 켜고 시간 범위를 설정하면, 그 시간대에 순위표 닉네임 위에 자동으로
              &ldquo;IN GAME&rdquo;이 표시됩니다. 종료 시간이 시작 시간보다 빠르면 다음날
              새벽까지로 자동 처리됩니다.
            </p>

            <div className="divide-y divide-gray-100">
              {dayRows.map((row, idx) => (
                <div key={row.day} className="flex items-center gap-2.5 py-2.5">
                  <label className="flex items-center gap-2 w-14 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setDayRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, enabled } : r))
                        );
                      }}
                      className="accent-blue-600"
                    />
                    <span className="text-sm font-semibold text-gray-800">{DAY_LABELS[row.day]}</span>
                  </label>
                  <input
                    type="time"
                    disabled={!row.enabled}
                    value={minutesToTimeInput(row.startMinute)}
                    onChange={(e) => {
                      const startMinute = timeInputToMinutes(e.target.value);
                      setDayRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, startMinute } : r))
                      );
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-300"
                  />
                  <span className="text-gray-400 text-xs shrink-0">~</span>
                  <input
                    type="time"
                    disabled={!row.enabled}
                    value={minutesToTimeInput(row.endMinute)}
                    onChange={(e) => {
                      const endMinute = timeInputToMinutes(e.target.value);
                      setDayRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, endMinute } : r))
                      );
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-300"
                  />
                </div>
              ))}
            </div>

            {scheduleError && <p className="text-xs text-red-500">{scheduleError}</p>}
            {scheduleSaved && <p className="text-xs text-green-600">저장되었습니다!</p>}

            <button
              type="button"
              onClick={handleScheduleSave}
              disabled={scheduleSaving}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
            >
              {scheduleSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        ) : (
        <>
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
        </>
        )}
      </div>
    </div>
  );
}
