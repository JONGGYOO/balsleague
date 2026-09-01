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

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return defaultSchedule();

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return existing?.schedule ?? defaultSchedule();
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

    const existing = await ctx.db
      .query("gameAvailability")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { schedule: args.schedule, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("gameAvailability", {
        userId: user._id,
        schedule: args.schedule,
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
export async function computeInGameMap(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userIds: Id<"users">[]
): Promise<Map<Id<"users">, boolean>> {
  const result = new Map<Id<"users">, boolean>();
  await Promise.all(
    userIds.map(async (userId) => {
      const doc = await ctx.db
        .query("gameAvailability")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      result.set(userId, isInGameNow(doc?.schedule as ScheduleEntry[] | undefined));
    })
  );
  return result;
}
