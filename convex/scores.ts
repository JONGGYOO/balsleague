import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getOrCreateUser } from "./utils";

export const add = mutation({
  args: {
    leagueId: v.id("leagues"),
    opponentUserId: v.id("users"),
    myScore: v.number(),
    opponentScore: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await getOrCreateUser(ctx);
    if (me._id === args.opponentUserId) throw new Error("자신과의 경기는 입력할 수 없습니다.");

    const myParticipation = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", me._id)
      )
      .unique();
    // status 없는 레거시 레코드는 approved로 간주
    if (!myParticipation || myParticipation.status === "pending") {
      throw new Error("승인된 참가자만 스코어를 입력할 수 있습니다.");
    }

    const opponentParticipation = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league_and_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.opponentUserId)
      )
      .unique();
    if (!opponentParticipation || opponentParticipation.status === "pending") {
      throw new Error("상대방이 승인된 참가자가 아닙니다.");
    }

    await ctx.db.insert("scores", {
      leagueId: args.leagueId,
      homeUserId: me._id,
      homeScore: args.myScore,
      awayUserId: args.opponentUserId,
      awayScore: args.opponentScore,
    });
  },
});

export const listByLeague = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .order("desc")
      .take(50);

    return await Promise.all(
      scores.map(async (score) => {
        const homeUser = await ctx.db.get(score.homeUserId);
        const awayUser = await ctx.db.get(score.awayUserId);
        return { ...score, homeUser, awayUser };
      })
    );
  },
});

export const getStandings = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const participants = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .take(200);

    const allScores = await ctx.db
      .query("scores")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .take(500);

    type StatsEntry = {
      userId: Id<"users">;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      games: number;
    };

    const statsMap = new Map<string, StatsEntry>();
    for (const p of participants) {
      statsMap.set(p.userId, {
        userId: p.userId,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        games: 0,
      });
    }

    for (const score of allScores) {
      const home = statsMap.get(score.homeUserId);
      const away = statsMap.get(score.awayUserId);

      if (home) {
        home.games++;
        home.goalsFor += score.homeScore;
        home.goalsAgainst += score.awayScore;
        if (score.homeScore > score.awayScore) home.wins++;
        else if (score.homeScore === score.awayScore) home.draws++;
        else home.losses++;
      }

      if (away) {
        away.games++;
        away.goalsFor += score.awayScore;
        away.goalsAgainst += score.homeScore;
        if (score.awayScore > score.homeScore) away.wins++;
        else if (score.awayScore === score.homeScore) away.draws++;
        else away.losses++;
      }
    }

    const result = await Promise.all(
      Array.from(statsMap.values()).map(async (entry) => {
        const user = await ctx.db.get(entry.userId);
        const goalDiff = entry.goalsFor - entry.goalsAgainst;
        return { ...entry, user, goalDiff };
      })
    );

    // 승 → 무 → 패(적을수록) → 득실 → 경기수 순으로 정렬
    result.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.draws !== a.draws) return b.draws - a.draws;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.games - a.games;
    });

    return result;
  },
});

// 같은 리그 내 동일 상대와의 기존 경기 여부 확인
export const checkDuplicate = query({
  args: {
    leagueId: v.id("leagues"),
    opponentUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) return false;

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .take(500);

    return scores.some(
      (s) =>
        (s.homeUserId === me._id && s.awayUserId === args.opponentUserId) ||
        (s.homeUserId === args.opponentUserId && s.awayUserId === me._id)
    );
  },
});

// 리그의 전체 경기 결과 (matches 페이지용)
export const listAllByLeague = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .order("desc")
      .take(500);

    return await Promise.all(
      scores.map(async (score) => {
        const homeUser = await ctx.db.get(score.homeUserId);
        const awayUser = await ctx.db.get(score.awayUserId);
        return { ...score, homeUser, awayUser };
      })
    );
  },
});

// 선수 통계 (현재 리그 + 전체 합산 + 뷰어 상대 전적)
export const getPlayerStats = query({
  args: {
    userId: v.id("users"),
    leagueId: v.optional(v.id("leagues")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const player = await ctx.db.get(args.userId);
    if (!player) return null;

    const viewer = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const isViewingSelf = viewer?._id === args.userId;

    type Stat = { games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };

    function zero(): Stat {
      return { games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    }

    function acc(s: Stat, myG: number, oppG: number) {
      s.games++;
      s.goalsFor += myG;
      s.goalsAgainst += oppG;
      if (myG > oppG) s.wins++;
      else if (myG < oppG) s.losses++;
      else s.draws++;
    }

    // ── 현재 리그 통계 ──────────────────────────────────────
    let currentLeagueStats: (Stat & { goalDiff: number }) | null = null;
    let vsViewerCurrentLeague: (Stat & { goalDiff: number }) | null = null;

    if (args.leagueId) {
      const leagueScores = await ctx.db
        .query("scores")
        .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId!))
        .take(500);

      const clStat = zero();
      for (const s of leagueScores) {
        if (s.homeUserId === args.userId || s.awayUserId === args.userId) {
          const isHome = s.homeUserId === args.userId;
          acc(clStat, isHome ? s.homeScore : s.awayScore, isHome ? s.awayScore : s.homeScore);
        }
      }
      currentLeagueStats = { ...clStat, goalDiff: clStat.goalsFor - clStat.goalsAgainst };

      if (viewer && !isViewingSelf) {
        const vclStat = zero();
        for (const s of leagueScores) {
          const pHome = s.homeUserId === args.userId, pAway = s.awayUserId === args.userId;
          const vHome = s.homeUserId === viewer._id, vAway = s.awayUserId === viewer._id;
          if ((pHome && vAway) || (pAway && vHome)) {
            acc(vclStat, pHome ? s.homeScore : s.awayScore, pHome ? s.awayScore : s.homeScore);
          }
        }
        vsViewerCurrentLeague = { ...vclStat, goalDiff: vclStat.goalsFor - vclStat.goalsAgainst };
      }
    }

    // ── 전체 리그 통계 ─────────────────────────────────────────
    const participations = await ctx.db
      .query("leagueParticipants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(200);

    type MatchWithLeague = Doc<"scores"> & { league: Doc<"leagues"> | null };
    const allMatches: MatchWithLeague[] = [];

    for (const p of participations) {
      const leagueScores = await ctx.db
        .query("scores")
        .withIndex("by_league", (q) => q.eq("leagueId", p.leagueId))
        .take(500);

      const mine = leagueScores.filter(
        (s) => s.homeUserId === args.userId || s.awayUserId === args.userId
      );
      const league = await ctx.db.get(p.leagueId);
      for (const s of mine) allMatches.push({ ...s, league });
    }

    allMatches.sort((a, b) => b._creationTime - a._creationTime);

    const opponentIds = new Set<Id<"users">>();
    for (const m of allMatches) {
      if (m.homeUserId !== args.userId) opponentIds.add(m.homeUserId);
      if (m.awayUserId !== args.userId) opponentIds.add(m.awayUserId);
    }

    const userMap = new Map<string, Doc<"users">>();
    for (const oppId of opponentIds) {
      const u = await ctx.db.get(oppId);
      if (u) userMap.set(oppId, u);
    }

    const overall = zero();
    const vsViewerAll = zero();

    const enrichedMatches = allMatches.map((m) => {
      const isHome = m.homeUserId === args.userId;
      const myScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      const oppId: Id<"users"> = isHome ? m.awayUserId : m.homeUserId;
      const opponent = userMap.get(oppId) ?? null;
      const result: "win" | "draw" | "loss" =
        myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

      acc(overall, myScore, oppScore);
      if (viewer && !isViewingSelf && oppId === viewer._id) acc(vsViewerAll, myScore, oppScore);

      return { ...m, myScore, oppScore, oppId, opponent, result };
    });

    return {
      player,
      currentLeagueStats,
      overall: { ...overall, goalDiff: overall.goalsFor - overall.goalsAgainst },
      vsViewer: viewer && !isViewingSelf
        ? {
            currentLeague: vsViewerCurrentLeague,
            allLeagues: { ...vsViewerAll, goalDiff: vsViewerAll.goalsFor - vsViewerAll.goalsAgainst },
            viewer,
          }
        : null,
      matches: enrichedMatches,
    };
  },
});
