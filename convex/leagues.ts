import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getEffectiveRole, getOrCreateUser, SUPER_ADMIN_EMAIL } from "./utils";
import { computeStandings } from "./scores";

// 리그 목록 페이지에 필요한 데이터를 1회 요청으로 가져옴 (성능 최적화)
export const getLeaguesPageData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return { user: null, leagues: [], participations: [] };

    const email = identity.email ?? user.email ?? "";
    const effectiveRole: "superAdmin" | "admin" | "user" =
      email === SUPER_ADMIN_EMAIL
        ? "superAdmin"
        : user.role === "admin"
          ? "admin"
          : "user";

    const all = await ctx.db.query("leagues").order("desc").take(200);
    const leagues = all.filter((l) => !l.deletedAt);

    const participations = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(200);

    return {
      user: { ...user, effectiveRole, email },
      leagues,
      participations,
    };
  },
});

export const getById = query({
  args: { id: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const league = await ctx.db.get(args.id);
    if (!league || league.deletedAt) return null;
    return league;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const all = await ctx.db.query("leagues").order("desc").take(200);
    return all.filter((l) => !l.deletedAt);
  },
});

export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin") return [];
    const all = await ctx.db.query("leagues").order("desc").take(200);
    return all.filter((l) => !!l.deletedAt);
  },
});

export const create = mutation({
  args: {
    year: v.number(),
    month: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    return await ctx.db.insert("leagues", {
      year: args.year,
      month: args.month,
      name: args.name,
      createdBy: identity.tokenIdentifier,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("leagues"),
    year: v.number(),
    month: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    // 소프트 삭제: 기록은 보존하고 deletedAt 타임스탬프만 설정
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

export const restore = mutation({
  args: { id: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin") throw new Error("슈퍼관리자만 복원할 수 있습니다.");

    const league = await ctx.db.get(args.id);
    if (!league) throw new Error("리그를 찾을 수 없습니다.");

    // deletedAt 필드 제거를 위해 replace 사용
    const { deletedAt: _removed, ...rest } = league;
    await ctx.db.replace(args.id, rest);
  },
});

// 리그 종료: 순위를 확정하고 1위 참가자에게 우승 횟수(leagueWins)를 지급.
// 종료 후에도 관리자는 계속 스코어를 수정할 수 있음(scores.ts assertScoreWritable 참고),
// 일반 사용자만 입력/수정이 차단됨. 재종료로 인한 중복 지급을 막기 위해 이미 종료된
// 리그는 다시 종료할 수 없음.
export const endLeague = mutation({
  args: { id: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    const league = await ctx.db.get(args.id);
    if (!league) throw new Error("리그를 찾을 수 없습니다.");
    if (league.status === "ended") throw new Error("이미 종료된 리그입니다.");

    const standings = await computeStandings(ctx, args.id);
    const winner = standings.find((s) => s.games > 0) ?? null;

    if (winner) {
      const winnerUser = await ctx.db.get(winner.userId);
      await ctx.db.patch(winner.userId, {
        leagueWins: (winnerUser?.leagueWins ?? 0) + 1,
      });
    }

    await ctx.db.patch(args.id, {
      status: "ended",
      endedAt: Date.now(),
      winnerUserId: winner?.userId,
    });
  },
});

// --- 참가 관련 ---

export const join = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const existing = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", user._id)
      )
      .unique();
    if (existing) return;

    const role = await getEffectiveRole(ctx);
    const status =
      role === "superAdmin" || role === "admin" ? "approved" : "pending";

    await ctx.db.insert("leagueParticipants", {
      leagueId: args.leagueId,
      userId: user._id,
      status,
    });
  },
});

export const leave = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const existing = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", user._id)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getMyParticipationStatus = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return null;

    const existing = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", user._id)
      )
      .unique();

    if (!existing) return null;
    return existing.status ?? "approved"; // status 없는 레거시 레코드 = approved
  },
});

export const listMyParticipations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return [];

    return await ctx.db
      .query("leagueParticipants")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(200);
  },
});

export const getParticipants = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const all = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .take(200);

    // status 없는 레코드(레거시)는 approved로 간주
    const approved = all.filter((p) => !p.status || p.status === "approved");

    return await Promise.all(
      approved.map(async (p) => {
        const user = await ctx.db.get(p.userId);
        return { ...p, user };
      })
    );
  },
});

export const isParticipating = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return false;

    const existing = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", user._id)
      )
      .unique();

    if (!existing) return false;
    return !existing.status || existing.status === "approved";
  },
});

// --- 관리자: 참가 승인/거절 ---

export const approveParticipant = mutation({
  args: { participantId: v.id("leagueParticipants") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.patch(args.participantId, { status: "approved" });
  },
});

export const rejectParticipant = mutation({
  args: { participantId: v.id("leagueParticipants") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.delete(args.participantId);
  },
});

export const getPendingParticipants = query({
  args: {},
  handler: async (ctx) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") return [];

    const all = await ctx.db.query("leagueParticipants").take(500);
    const pending = all.filter((p) => p.status === "pending");

    return await Promise.all(
      pending.map(async (p) => {
        const user = await ctx.db.get(p.userId);
        const league = await ctx.db.get(p.leagueId);
        return { ...p, user, league };
      })
    );
  },
});
