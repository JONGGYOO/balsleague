import { query } from "./_generated/server";
import { v } from "convex/values";

// 월별 우수 클랜원 시상 — 2026년 7월부터 집계 시작
export const AWARDS_START_YEAR = 2026;
export const AWARDS_START_MONTH = 7;
// 산출 근거: 그 달에 "실제로 진행된"(기록이 입력된) 경기 수만큼 부여 (승패 무관)
export const POINTS_PER_LEAGUE_GAME = 2;
export const POINTS_PER_INNERWAR_GAME = 1;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 리그/내전 레코드 자체의 year/month가 아니라, 실제 경기가 기록된 시각(_creationTime) 기준으로
// 그 달을 판정한다. 예: "2026년 6월" 리그가 계속 진행 중이더라도 7월에 치른 경기는 7월 집계에 포함.
// 서버 런타임 시간대와 무관하게 한국시간(KST, UTC+9) 기준 달력으로 계산한다.
function kstYearMonth(creationTime: number): { year: number; month: number } {
  const d = new Date(creationTime + KST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// 지정한 연/월에 "실제로 진행된" 리그·내전 경기 참여 점수를 실시간 집계.
// 대상은 전체 사용자(경기가 없으면 0점으로 표시).
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
      // 삭제된(테스트용 등) 리그/내전의 경기는 집계에서 제외
      const allLeagues = await ctx.db.query("leagues").take(500);
      const validLeagueIds = new Set(
        allLeagues.filter((l) => !l.deletedAt).map((l) => l._id)
      );

      const allScores = await ctx.db.query("scores").take(5000);
      for (const s of allScores) {
        if (!validLeagueIds.has(s.leagueId)) continue;
        const ym = kstYearMonth(s._creationTime);
        if (ym.year !== args.year || ym.month !== args.month) continue;
        bump(s.homeUserId, "leagueGames");
        bump(s.awayUserId, "leagueGames");
      }

      const allInnerwars = await ctx.db.query("innerwars").take(500);
      const validInnerwarIds = new Set(
        allInnerwars.filter((w) => !w.deletedAt).map((w) => w._id)
      );

      const allMatches = await ctx.db.query("innerwarMatches").take(5000);
      for (const m of allMatches) {
        if (m.status !== "done") continue;
        if (!validInnerwarIds.has(m.innerwarId)) continue;
        const ym = kstYearMonth(m._creationTime);
        if (ym.year !== args.year || ym.month !== args.month) continue;
        bump(m.playerAId, "innerwarGames");
        bump(m.playerBId, "innerwarGames");
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
