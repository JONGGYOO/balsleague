import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getEffectiveRole, getOrCreateUser, SUPER_ADMIN_EMAIL } from "./utils";

// 4-3: 팀 배정/초기화 권한 체크 헬퍼
async function checkTeamManagePermission(
  ctx: MutationCtx,
  innerwarId: Id<"innerwars">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const innerwar = await ctx.db.get(innerwarId);
  if (!innerwar) throw new Error("내전을 찾을 수 없습니다.");

  const permission = innerwar.teamAssignPermission ?? "admin";
  if (permission !== "all") {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
  }
}

export const getInnerwarsPageData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return { user: null, innerwars: [], participations: [] };

    const email = identity.email ?? user.email ?? "";
    const effectiveRole: "superAdmin" | "admin" | "user" =
      email === SUPER_ADMIN_EMAIL
        ? "superAdmin"
        : user.role === "admin"
          ? "admin"
          : "user";

    const all = await ctx.db.query("innerwars").order("desc").take(200);
    const innerwars = all.filter((w) => !w.deletedAt);

    const participations = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(200);

    return {
      user: { ...user, effectiveRole, email },
      innerwars,
      participations,
    };
  },
});

export const getDetail = query({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const innerwar = await ctx.db.get(args.innerwarId);
    if (!innerwar || innerwar.deletedAt) return null;

    const role = await getEffectiveRole(ctx);
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(200);

    const participantsWithUsers = await Promise.all(
      allParticipants.map(async (p) => {
        const user = await ctx.db.get(p.userId);
        return { ...p, user };
      })
    );

    const matches = await ctx.db
      .query("innerwarMatches")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(500);

    const matchesWithPlayers = await Promise.all(
      matches.map(async (m) => {
        const playerA = await ctx.db.get(m.playerAId);
        const playerB = await ctx.db.get(m.playerBId);
        const winner = m.winnerId ? await ctx.db.get(m.winnerId) : null;
        return { ...m, playerA, playerB, winner };
      })
    );

    return {
      innerwar,
      participants: participantsWithUsers,
      matches: matchesWithPlayers.sort((a, b) => a.matchIndex - b.matchIndex),
      currentUser: currentUser ? { ...currentUser, effectiveRole: role } : null,
    };
  },
});

// 4-3: teamAssignPermission 필드 추가 / 6-1: betItem 필드 추가
export const create = mutation({
  args: {
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    teamAssignPermission: v.optional(v.union(v.literal("admin"), v.literal("all"))),
    betItem: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    return await ctx.db.insert("innerwars", {
      year: args.year,
      month: args.month,
      day: args.day,
      name: args.name,
      createdBy: identity.tokenIdentifier,
      status: "draft",
      teamAssignPermission: args.teamAssignPermission ?? "admin",
      betItem: args.betItem,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("innerwars"),
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    teamAssignPermission: v.optional(v.union(v.literal("admin"), v.literal("all"))),
    betItem: v.optional(v.string()),
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

// 6-3: 기존 내전에 기본 내기품목 설정 (CLI 관리용 마이그레이션 — 인증 불필요)
export const setDefaultBetItem = mutation({
  args: { defaultBetItem: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("innerwars").take(500);
    let updated = 0;
    for (const w of all) {
      if (!w.betItem) {
        await ctx.db.patch(w._id, { betItem: args.defaultBetItem });
        updated++;
      }
    }
    return { updated };
  },
});

export const remove = mutation({
  args: { id: v.id("innerwars") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

// 3-1: 승인 절차 없이 바로 참가
export const join = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const existing = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar_and_user", (q) =>
        q.eq("innerwarId", args.innerwarId).eq("userId", user._id)
      )
      .unique();
    if (existing) return;

    await ctx.db.insert("innerwarParticipants", {
      innerwarId: args.innerwarId,
      userId: user._id,
      status: "approved",
    });
  },
});

export const leave = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const existing = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar_and_user", (q) =>
        q.eq("innerwarId", args.innerwarId).eq("userId", user._id)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const approveParticipant = mutation({
  args: { participantId: v.id("innerwarParticipants") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.patch(args.participantId, { status: "approved" });
  },
});

export const rejectParticipant = mutation({
  args: { participantId: v.id("innerwarParticipants") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.delete(args.participantId);
  },
});

// 4-3: teamAssignPermission 체크
export const assignTeamsRandom = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    await checkTeamManagePermission(ctx, args.innerwarId);

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(200);

    const approved = allParticipants.filter((p) => !p.status || p.status === "approved");
    if (approved.length < 2) throw new Error("최소 2명 이상이 필요합니다.");

    const shuffled = [...approved].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);

    for (let i = 0; i < shuffled.length; i++) {
      const team: "A" | "B" = i < half ? "A" : "B";
      const teamOrder = i < half ? i : i - half;
      await ctx.db.patch(shuffled[i]._id, { team, teamOrder });
    }

    const existingMatches = await ctx.db
      .query("innerwarMatches")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    const current = await ctx.db.get(args.innerwarId);
    if (!current) throw new Error("내전을 찾을 수 없습니다.");
    const { winnerTeam: _w, currentIndexA: _a, currentIndexB: _b, ...rest } = current;
    await ctx.db.replace(args.innerwarId, {
      ...rest,
      status: "teamAssigned",
      currentIndexA: 0,
      currentIndexB: 0,
    });
  },
});

// 4-3: teamAssignPermission 체크
// Grade.md 참고: 리그:내전 = 7:3 가중치. 승수 대신 승률(+스무딩)을 사용해
// 표본이 적은 선수가 과대/과소평가되는 것을 완화한다.
const SCORE_WEIGHT_LEAGUE = 0.7;
const SCORE_WEIGHT_INNERWAR = 0.3;
const SCORE_SMOOTHING_GAMES = 4; // 스무딩 상수(K) — 클수록 표본 적은 선수를 0.5(중간값)에 가깝게 당김

function smoothedWinRate(wins: number, games: number, k: number): number {
  return (wins + k * 0.5) / (games + k);
}

export const assignTeamsByScore = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    await checkTeamManagePermission(ctx, args.innerwarId);

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(200);

    const approved = allParticipants.filter((p) => !p.status || p.status === "approved");
    if (approved.length < 2) throw new Error("최소 2명 이상이 필요합니다.");

    // 리그 전적 (전체 리그 통합)
    const allLeagueScores = await ctx.db.query("scores").take(5000);
    // 내전 전적 (전체 내전 통합, 완료된 경기만 — 현재 배정 중인 내전은 아직 경기가 없으므로 자연히 제외됨)
    const allInnerwarMatches = await ctx.db.query("innerwarMatches").take(5000);
    const doneInnerwarMatches = allInnerwarMatches.filter((m) => m.status === "done");

    const scoreByParticipant = new Map<string, number>();
    for (const p of approved) {
      const leagueGames = allLeagueScores.filter(
        (s) => s.homeUserId === p.userId || s.awayUserId === p.userId
      );
      const leagueWins = leagueGames.filter(
        (s) =>
          (s.homeUserId === p.userId && s.homeScore > s.awayScore) ||
          (s.awayUserId === p.userId && s.awayScore > s.homeScore)
      ).length;
      const leagueRate = smoothedWinRate(leagueWins, leagueGames.length, SCORE_SMOOTHING_GAMES);

      const innerwarGames = doneInnerwarMatches.filter(
        (m) => m.playerAId === p.userId || m.playerBId === p.userId
      );
      const innerwarWins = innerwarGames.filter((m) => m.winnerId === p.userId).length;
      const innerwarRate = smoothedWinRate(innerwarWins, innerwarGames.length, SCORE_SMOOTHING_GAMES);

      scoreByParticipant.set(
        p._id,
        leagueRate * SCORE_WEIGHT_LEAGUE + innerwarRate * SCORE_WEIGHT_INNERWAR
      );
    }

    const sorted = [...approved].sort(
      (a, b) => (scoreByParticipant.get(b._id) ?? 0) - (scoreByParticipant.get(a._id) ?? 0)
    );

    // 그리디 팀 분배: 인원 수 차이가 나면 적은 쪽 우선, 같으면 합산 점수가 낮은 쪽에 배정
    // (Grade.md 3-3) — 정렬 순서를 기계적으로 교대하는 것보다 두 팀의 총 실력을 더 고르게 맞춘다.
    let orderA = 0;
    let orderB = 0;
    let totalA = 0;
    let totalB = 0;
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const score = scoreByParticipant.get(p._id) ?? 0;
      let team: "A" | "B";
      if (orderA - orderB >= 1) team = "B";
      else if (orderB - orderA >= 1) team = "A";
      else team = totalA <= totalB ? "A" : "B";

      const teamOrder = team === "A" ? orderA++ : orderB++;
      if (team === "A") totalA += score;
      else totalB += score;
      await ctx.db.patch(p._id, { team, teamOrder });
    }

    const existingMatches = await ctx.db
      .query("innerwarMatches")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    const current = await ctx.db.get(args.innerwarId);
    if (!current) throw new Error("내전을 찾을 수 없습니다.");
    const { winnerTeam: _w, currentIndexA: _a, currentIndexB: _b, ...rest } = current;
    await ctx.db.replace(args.innerwarId, {
      ...rest,
      status: "teamAssigned",
      currentIndexA: 0,
      currentIndexB: 0,
    });
  },
});

// 4-3: teamAssignPermission 체크
export const setPlayerTeam = mutation({
  args: {
    participantId: v.id("innerwarParticipants"),
    team: v.union(v.literal("A"), v.literal("B"), v.literal("none")),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");

    await checkTeamManagePermission(ctx, participant.innerwarId);

    const innerwar = await ctx.db.get(participant.innerwarId);
    if (innerwar?.status === "inProgress" || innerwar?.status === "done") {
      throw new Error("경기 시작 후에는 팀을 변경할 수 없습니다.");
    }

    if (args.team === "none") {
      const { team: _t, teamOrder: _o, ...rest } = participant;
      await ctx.db.replace(args.participantId, rest);
      return;
    }

    const sameTeam = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", participant.innerwarId))
      .take(200);

    const teamMembers = sameTeam.filter(
      (p) => p.team === args.team && p._id !== args.participantId
    );
    const maxOrder = teamMembers.reduce((max, p) => Math.max(max, p.teamOrder ?? -1), -1);

    await ctx.db.patch(args.participantId, { team: args.team, teamOrder: maxOrder + 1 });
  },
});

// 3-2 / 4-4: 모든 사용자가 순번 변경 가능
// 8-2: 경기 시작(inProgress) 후에도 아직 경기하지 않은 선수는 순번 변경 가능.
//      현재 경기 중인(활성 슬롯) 선수는 점수 저장 전까지만 변경 가능하며,
//      이 경우 진행 중인 매치의 선수 참조도 함께 갱신한다. 이미 경기를 마쳤거나
//      점수가 저장된 선수는 순번 변경 불가.
export const reorderTeamMember = mutation({
  args: {
    participantId: v.id("innerwarParticipants"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");

    const innerwar = await ctx.db.get(participant.innerwarId);
    if (innerwar?.status === "done") {
      throw new Error("경기가 종료되어 순번을 변경할 수 없습니다.");
    }

    const team = participant.team;
    if (!team) throw new Error("팀이 배정되지 않았습니다.");

    const allInTeam = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", participant.innerwarId))
      .take(200);

    const teamMembers = allInTeam
      .filter((p) => p.team === team)
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const currentIdx = teamMembers.findIndex((p) => p._id === args.participantId);
    if (currentIdx === -1) return;

    const targetIdx = args.direction === "up" ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= teamMembers.length) return;

    let activeMatchToUpdate: Doc<"innerwarMatches"> | null = null;
    let currentIndexForTeam = -1;

    if (innerwar?.status === "inProgress") {
      currentIndexForTeam =
        team === "A" ? (innerwar.currentIndexA ?? 0) : (innerwar.currentIndexB ?? 0);

      // 이미 경기를 마친(탈락한) 선수 자리는 관여 불가
      if (currentIdx < currentIndexForTeam || targetIdx < currentIndexForTeam) {
        throw new Error("이미 경기를 진행한 선수는 순번을 변경할 수 없습니다.");
      }

      // 현재 경기 중인 활성 슬롯이 관여되면, 점수가 아직 저장되지 않은 경우에만 허용
      if (currentIdx === currentIndexForTeam || targetIdx === currentIndexForTeam) {
        const matches = await ctx.db
          .query("innerwarMatches")
          .withIndex("by_innerwar", (q) => q.eq("innerwarId", participant.innerwarId))
          .take(500);
        const active = matches.find((m) => m.status === "pending" || m.status === "scored") ?? null;
        if (!active || active.status === "scored") {
          throw new Error("이미 점수를 저장한 선수는 순번을 변경할 수 없습니다.");
        }
        activeMatchToUpdate = active;
      }
    }

    const current = teamMembers[currentIdx];
    const target = teamMembers[targetIdx];

    const currentOrder = current.teamOrder ?? currentIdx;
    const targetOrder = target.teamOrder ?? targetIdx;

    await ctx.db.patch(current._id, { teamOrder: targetOrder });
    await ctx.db.patch(target._id, { teamOrder: currentOrder });

    if (activeMatchToUpdate) {
      const newActiveParticipant = currentIdx === currentIndexForTeam ? target : current;
      await ctx.db.patch(
        activeMatchToUpdate._id,
        team === "A"
          ? { playerAId: newActiveParticipant.userId }
          : { playerBId: newActiveParticipant.userId }
      );
    }
  },
});

// 4-3: 경기 시작은 모든 사용자 가능
export const startGame = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(200);

    const teamA = allParticipants
      .filter((p) => p.team === "A")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const teamB = allParticipants
      .filter((p) => p.team === "B")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    if (teamA.length === 0 || teamB.length === 0) {
      throw new Error("양 팀에 최소 1명 이상이 필요합니다.");
    }

    const existingMatches = await ctx.db
      .query("innerwarMatches")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    await ctx.db.insert("innerwarMatches", {
      innerwarId: args.innerwarId,
      playerAId: teamA[0].userId,
      playerBId: teamB[0].userId,
      matchIndex: 0,
      status: "pending",
    });

    const current = await ctx.db.get(args.innerwarId);
    if (!current) throw new Error("내전을 찾을 수 없습니다.");
    const { winnerTeam: _w, ...rest } = current;
    await ctx.db.replace(args.innerwarId, {
      ...rest,
      status: "inProgress",
      currentIndexA: 0,
      currentIndexB: 0,
    });
  },
});

// 5-1: 점수 저장 — 슈퍼관리자/관리자 전체 가능, 일반 사용자는 현재 경기 양쪽 선수만 가능
export const saveMatchScore = mutation({
  args: {
    matchId: v.id("innerwarMatches"),
    scoreA: v.number(),
    scoreB: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status === "done") throw new Error("이미 확정된 경기입니다.");

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";
    if (!isManager) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (!me) throw new Error("사용자를 찾을 수 없습니다.");
      const isPlayer = match.playerAId === me._id || match.playerBId === me._id;
      if (!isPlayer) throw new Error("현재 경기 참가자 또는 관리자만 점수를 입력할 수 있습니다.");
    }

    const isDraw = args.scoreA === args.scoreB;
    if (isDraw) {
      // 동점: winnerId 제거하고 저장 (마지막 경기 여부는 confirmMatchResult에서 검증)
      await ctx.db.replace(args.matchId, {
        innerwarId: match.innerwarId,
        playerAId: match.playerAId,
        playerBId: match.playerBId,
        matchIndex: match.matchIndex,
        scoreA: args.scoreA,
        scoreB: args.scoreB,
        status: "scored",
      });
    } else {
      const winnerId = args.scoreA > args.scoreB ? match.playerAId : match.playerBId;
      await ctx.db.patch(args.matchId, {
        scoreA: args.scoreA,
        scoreB: args.scoreB,
        winnerId,
        status: "scored",
      });
    }
  },
});

// 5-1: 점수 확정 + 다음 경기 진행 — 슈퍼관리자/관리자 전체 가능, 일반 사용자는 현재 경기 양쪽 선수만 가능
export const confirmMatchResult = mutation({
  args: { matchId: v.id("innerwarMatches") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";
    if (!isManager) {
      const matchForCheck = await ctx.db.get(args.matchId);
      if (!matchForCheck) throw new Error("경기를 찾을 수 없습니다.");
      const me = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (!me) throw new Error("사용자를 찾을 수 없습니다.");
      const isPlayer = matchForCheck.playerAId === me._id || matchForCheck.playerBId === me._id;
      if (!isPlayer) throw new Error("현재 경기 참가자 또는 관리자만 결과를 확정할 수 있습니다.");
    }

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status === "done") throw new Error("이미 확정된 경기입니다.");
    if (match.status !== "scored") throw new Error("점수를 먼저 입력하세요.");
    if (match.scoreA === undefined || match.scoreB === undefined) throw new Error("점수가 입력되지 않았습니다.");

    const innerwar = await ctx.db.get(match.innerwarId);
    if (!innerwar) throw new Error("내전을 찾을 수 없습니다.");

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", match.innerwarId))
      .take(200);

    const teamA = allParticipants
      .filter((p) => p.team === "A")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const teamB = allParticipants
      .filter((p) => p.team === "B")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const currentIndexA = innerwar.currentIndexA ?? 0;
    const currentIndexB = innerwar.currentIndexB ?? 0;
    const isDraw = match.scoreA === match.scoreB;

    if (isDraw) {
      // 4-1: 마지막 경기(양 팀 모두 마지막 선수)면 동점 불허
      const isLastA = currentIndexA === teamA.length - 1;
      const isLastB = currentIndexB === teamB.length - 1;
      if (isLastA && isLastB) {
        throw new Error("마지막 경기는 동점이 허용되지 않습니다. 연장 또는 승부차기로 결정해주세요.");
      }

      // 동반 탈락: 양 팀 모두 다음 선수로 진행
      await ctx.db.patch(args.matchId, { status: "done" });

      const nextA = currentIndexA + 1;
      const nextB = currentIndexB + 1;

      if (nextA >= teamA.length) {
        await ctx.db.patch(match.innerwarId, { status: "done", winnerTeam: "B", currentIndexA: nextA, currentIndexB: nextB });
        return;
      }
      if (nextB >= teamB.length) {
        await ctx.db.patch(match.innerwarId, { status: "done", winnerTeam: "A", currentIndexA: nextA, currentIndexB: nextB });
        return;
      }

      await ctx.db.insert("innerwarMatches", {
        innerwarId: match.innerwarId,
        playerAId: teamA[nextA].userId,
        playerBId: teamB[nextB].userId,
        matchIndex: match.matchIndex + 1,
        status: "pending",
      });
      await ctx.db.patch(match.innerwarId, { currentIndexA: nextA, currentIndexB: nextB });
      return;
    }

    // 일반 승패 처리
    const isAWinner = match.scoreA > match.scoreB;
    const winnerId = isAWinner ? match.playerAId : match.playerBId;
    await ctx.db.patch(args.matchId, { winnerId, status: "done" });

    let nextIndexA = currentIndexA;
    let nextIndexB = currentIndexB;

    if (isAWinner) {
      nextIndexB++;
    } else {
      nextIndexA++;
    }

    if (nextIndexA >= teamA.length) {
      await ctx.db.patch(match.innerwarId, { status: "done", winnerTeam: "B", currentIndexA: nextIndexA, currentIndexB: nextIndexB });
      return;
    }
    if (nextIndexB >= teamB.length) {
      await ctx.db.patch(match.innerwarId, { status: "done", winnerTeam: "A", currentIndexA: nextIndexA, currentIndexB: nextIndexB });
      return;
    }

    await ctx.db.insert("innerwarMatches", {
      innerwarId: match.innerwarId,
      playerAId: teamA[nextIndexA].userId,
      playerBId: teamB[nextIndexB].userId,
      matchIndex: match.matchIndex + 1,
      status: "pending",
    });
    await ctx.db.patch(match.innerwarId, { currentIndexA: nextIndexA, currentIndexB: nextIndexB });
  },
});

// 4-2 / 4-3 / 5-1: 초기화 권한 제어
export const resetTeams = mutation({
  args: { innerwarId: v.id("innerwars") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const innerwarForCheck = await ctx.db.get(args.innerwarId);
    if (!innerwarForCheck) throw new Error("내전을 찾을 수 없습니다.");

    const role = await getEffectiveRole(ctx);

    // 5-1: 경기 시작 후에는 무조건 관리자만 초기화 가능
    if (innerwarForCheck.status === "inProgress" || innerwarForCheck.status === "done") {
      if (role !== "superAdmin" && role !== "admin") {
        throw new Error("경기 시작 후에는 관리자만 초기화할 수 있습니다.");
      }
    } else {
      // draft/teamAssigned: teamAssignPermission 설정에 따라
      const permission = innerwarForCheck.teamAssignPermission ?? "admin";
      if (permission !== "all" && role !== "superAdmin" && role !== "admin") {
        throw new Error("권한이 없습니다.");
      }
    }

    const allParticipants = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(200);

    for (const p of allParticipants) {
      const { team: _t, teamOrder: _o, ...rest } = p;
      await ctx.db.replace(p._id, rest);
    }

    const existingMatches = await ctx.db
      .query("innerwarMatches")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", args.innerwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    const current = await ctx.db.get(args.innerwarId);
    if (!current) return;
    const { winnerTeam: _w, currentIndexA: _a, currentIndexB: _b, ...rest } = current;
    await ctx.db.replace(args.innerwarId, { ...rest, status: "draft" });
  },
});

// 9-1: 경기 진행 중, 아직 경기하지 않은 참가자를 슈퍼관리자/관리자가 제외
export const removeUnplayedParticipant = mutation({
  args: { participantId: v.id("innerwarParticipants") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");

    const innerwar = await ctx.db.get(participant.innerwarId);
    if (!innerwar) throw new Error("내전을 찾을 수 없습니다.");
    if (innerwar.status !== "inProgress") {
      throw new Error("경기 진행 중에만 참가자를 제외할 수 있습니다.");
    }

    const team = participant.team;
    if (!team) throw new Error("팀이 배정되지 않았습니다.");

    const allInTeam = await ctx.db
      .query("innerwarParticipants")
      .withIndex("by_innerwar", (q) => q.eq("innerwarId", participant.innerwarId))
      .take(200);

    const teamMembers = allInTeam
      .filter((p) => p.team === team)
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const idx = teamMembers.findIndex((p) => p._id === args.participantId);
    if (idx === -1) return;

    const currentIndexForTeam =
      team === "A" ? (innerwar.currentIndexA ?? 0) : (innerwar.currentIndexB ?? 0);

    if (idx <= currentIndexForTeam) {
      throw new Error("이미 경기했거나 현재 경기 중인 선수는 제외할 수 없습니다.");
    }

    await ctx.db.delete(args.participantId);

    // 제외된 선수 뒤의 순번을 당겨서 빈 자리 없이 재정렬
    const remaining = teamMembers.filter((p) => p._id !== args.participantId);
    for (let i = 0; i < remaining.length; i++) {
      if ((remaining[i].teamOrder ?? i) !== i) {
        await ctx.db.patch(remaining[i]._id, { teamOrder: i });
      }
    }
  },
});
