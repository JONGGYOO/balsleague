import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getOrCreateUser } from "./utils";

// 0=일 1=월 2=화 3=수 4=목 5=금 6=토 (JS Date getUTCDay 기준)
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
// 자정을 넘기는 설정도 허용하되, 새벽 6시(1440+360)까지로 제한
const MAX_END_MINUTE = 1440 + 360;

type ScheduleEntry = {
  day: number;
  enabled: boolean;
  startMinute: number;
  endMinute: number;
};

function defaultSchedule(): ScheduleEntry[] {
  return DAYS.map((day) => ({ day, enabled: false, startMinute: 20 * 60, endMinute: 23 * 60 }));
}

// 원클릭 "게임 중" 토글을 켜면 이 시간(ms) 동안만 유지되고 자동으로 꺼짐(깜빡 잊고 계속 켜두는 것 방지)
const MANUAL_DURATION_MS = 3 * 60 * 60 * 1000;

// 리그 상세 페이지 등에서 내 토글 버튼 상태를 표시할 때 사용
export const getMyStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { manualActive: false };

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return { manualActive: false };

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return { manualActive: !!existing?.manualUntil && existing.manualUntil > Date.now() };
  },
});

// 원클릭 "게임 중" 토글 — 꺼져 있으면 지금부터 MANUAL_DURATION_MS 동안 켜고, 켜져 있으면 즉시 끈다
export const toggleManual = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getOrCreateUser(ctx);

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const currentlyActive = !!existing?.manualUntil && existing.manualUntil > Date.now();
    const manualUntil = currentlyActive ? undefined : Date.now() + MANUAL_DURATION_MS;

    if (existing) {
      await ctx.db.patch(existing._id, { manualUntil, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("gameAvailability", {
        userId: user._id,
        schedule: defaultSchedule(),
        manualUntil,
        updatedAt: Date.now(),
      });
    }

    return { manualActive: !currentlyActive };
  },
});

const MAX_COMMENT_LENGTH = 200;

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return { schedule: defaultSchedule(), comment: "" };

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return {
      schedule: existing?.schedule ?? defaultSchedule(),
      comment: existing?.comment ?? "",
    };
  },
});

// 선수 상세 페이지 등에서 다른 사용자의 게임 가능 시간을 열람할 때 사용 (로그인한 사용자면 누구나 조회 가능)
export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const manualActive = !!doc?.manualUntil && doc.manualUntil > Date.now();
    return {
      schedule: doc?.schedule ?? defaultSchedule(),
      comment: doc?.comment ?? "",
      inGame: manualActive || isInGameNow(doc?.schedule),
    };
  },
});

export const save = mutation({
  args: {
    schedule: v.array(
      v.object({
        day: v.number(),
        enabled: v.boolean(),
        startMinute: v.number(),
        endMinute: v.number(),
      })
    ),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    if (args.schedule.length !== 7) throw new Error("요일별 설정이 올바르지 않습니다.");
    const seenDays = new Set<number>();
    for (const entry of args.schedule) {
      if (entry.day < 0 || entry.day > 6) throw new Error("요일 값이 올바르지 않습니다.");
      if (seenDays.has(entry.day)) throw new Error("요일이 중복되었습니다.");
      seenDays.add(entry.day);
      if (entry.enabled) {
        if (entry.startMinute < 0 || entry.startMinute > 1439) {
          throw new Error("시작 시간이 올바르지 않습니다.");
        }
        if (entry.endMinute <= entry.startMinute || entry.endMinute > MAX_END_MINUTE) {
          throw new Error("종료 시간이 올바르지 않습니다.");
        }
      }
    }

    const comment = args.comment?.trim().slice(0, MAX_COMMENT_LENGTH) ?? "";

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { schedule: args.schedule, comment, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("gameAvailability", {
        userId: user._id,
        schedule: args.schedule,
        comment,
        updatedAt: Date.now(),
      });
    }
  },
});

function nowInKST(): { day: number; minute: number } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { day: kst.getUTCDay(), minute: kst.getUTCHours() * 60 + kst.getUTCMinutes() };
}

// 현재 시각(KST) 기준으로 "게임 중"인지 계산.
// 자정을 넘기는 설정(예: 금 21:00~다음날 01:00)은 금요일 항목의 endMinute가 1440을 넘는 값(1500)으로
// 저장되므로, 토요일 새벽 시간대를 판단할 때는 하루 전(금요일) 항목의 초과분도 함께 확인한다.
export function isInGameNow(schedule: ScheduleEntry[] | null | undefined): boolean {
  if (!schedule || schedule.length === 0) return false;
  const { day, minute } = nowInKST();

  const today = schedule.find((s) => s.day === day);
  if (today?.enabled) {
    const end = Math.min(today.endMinute, 1440);
    if (minute >= today.startMinute && minute < end) return true;
  }

  const prevDay = (day + 6) % 7;
  const prev = schedule.find((s) => s.day === prevDay);
  if (prev?.enabled && prev.endMinute > 1440) {
    const overflowEnd = prev.endMinute - 1440;
    if (minute < overflowEnd) return true;
  }

  return false;
}

// 여러 사용자의 "게임 중" 여부를 한 번에 계산 (순위표 등에서 재사용)
// 요일별 예약 스케줄과 원클릭 수동 토글 중 하나라도 해당되면 게임 중으로 표시한다
export async function computeInGameMap(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userIds: Id<"users">[]
): Promise<Map<Id<"users">, boolean>> {
  const result = new Map<Id<"users">, boolean>();
  const now = Date.now();
  await Promise.all(
    userIds.map(async (userId) => {
      const doc = await ctx.db
        .query("gameAvailability")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      const manualActive = !!doc?.manualUntil && doc.manualUntil > now;
      const scheduled = isInGameNow(doc?.schedule as ScheduleEntry[] | undefined);
      result.set(userId, manualActive || scheduled);
    })
  );
  return result;
}
