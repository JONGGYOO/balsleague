import { query } from "./_generated/server";
import { v } from "convex/values";

// 월별 우수 클랜원 시상 — 2026년 7월부터 집계 시작
export const AWARDS_START_YEAR = 2026;
export const AWARDS_START_MONTH = 7;
// 산출 근거: 해당 월에 열린 리그/내전 기준으로 참여한 경기 수만큼 부여 (승패 무관)
export const POINTS_PER_LEAGUE_GAME = 2;
export const POINTS_PER_INNERWAR_GAME = 1;

// 지정한 연/월에 대한 리그·내전 경기 참여 점수를 실시간 집계.
// 대상은 전체 사용자(경기가 없으면 0점으로 표시). 리그/내전은 자체 year/month 필드 기준으로
// 그 달에 "열린" 이벤트로 간주한다(경기 입력 시점이 아니라 리그/내전이 속한 달).
export const getMonthlyAwards = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const beforeStart =
      args.year < AWARDS_START_YEAR ||
      (args.year === AWARDS_START_YEAR && args.month < AWARDS_START_MONTH);

    type Count = { leagueGames: number; innerwarGames: number };
    const counts = new Map<string, Count>();
    function bump(userId: string, field: keyof Count) {
      const c = counts.get(userId) ?? { leagueGames: 0, innerwarGames: 0 };
      c[field]++;
      counts.set(userId, c);
    }

    if (!beforeStart) {
      const allLeagues = await ctx.db.query("leagues").take(500);
      const targetLeagues = allLeagues.filter(
        (l) => !l.deletedAt && l.year === args.year && l.month === args.month
      );
      for (const league of targetLeagues) {
        const scores = await ctx.db
          .query("scores")
          .withIndex("by_league", (q) => q.eq("leagueId", league._id))
          .take(500);
        for (const s of scores) {
          bump(s.homeUserId, "leagueGames");
          bump(s.awayUserId, "leagueGames");
        }
      }

      const allInnerwars = await ctx.db.query("innerwars").take(500);
      const targetInnerwars = allInnerwars.filter(
        (w) => !w.deletedAt && w.year === args.year && w.month === args.month
      );
      for (const innerwar of targetInnerwars) {
        const matches = await ctx.db
          .query("innerwarMatches")
          .withIndex("by_innerwar", (q) => q.eq("innerwarId", innerwar._id))
          .take(500);
        for (const m of matches) {
          if (m.status !== "done") continue;
          bump(m.playerAId, "innerwarGames");
          bump(m.playerBId, "innerwarGames");
        }
      }
    }

    // 대상은 전원 — 경기가 없는 사용자도 0점으로 함께 표시
    const allUsers = await ctx.db.query("users").take(500);
    const entries = allUsers.map((u) => {
      const c = counts.get(u._id) ?? { leagueGames: 0, innerwarGames: 0 };
      const score = c.leagueGames * POINTS_PER_LEAGUE_GAME + c.innerwarGames * POINTS_PER_INNERWAR_GAME;
      return {
        userId: u._id,
        user: u,
        leagueGames: c.leagueGames,
        innerwarGames: c.innerwarGames,
        score,
      };
    });

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.leagueGames !== a.leagueGames) return b.leagueGames - a.leagueGames;
      return b.innerwarGames - a.innerwarGames;
    });

    return {
      entries,
      pointsPerLeagueGame: POINTS_PER_LEAGUE_GAME,
      pointsPerInnerwarGame: POINTS_PER_INNERWAR_GAME,
    };
  },
});
