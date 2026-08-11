import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 월별 우수 클랜원 시상 — 2026년 7월부터 집계 시작
export const AWARDS_START_YEAR = 2026;
export const AWARDS_START_MONTH = 7;
// 8-11-2: 산출 근거 — 리그는 실제 치른 경기 수, 내전/클전은 "참여한(실제 경기를 치른) 내전·클전 개수"
// 기준으로 부여 (승패 무관). 내전/클전은 경기 수가 아니라 몇 개의 내전/클전에 참여했는지로 집계.
export const POINTS_PER_LEAGUE_GAME = 1;
export const POINTS_PER_INNERWAR_PARTICIPATION = 1;
export const POINTS_PER_CLANWAR_PARTICIPATION = 2;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 리그/내전/클전 레코드 자체의 year/month가 아니라, 실제 경기가 기록된 시각(_creationTime) 기준으로
// 그 달을 판정한다. 서버 런타임 시간대와 무관하게 한국시간(KST, UTC+9) 기준 달력으로 계산한다.
function kstYearMonth(creationTime: number): { year: number; month: number } {
  const d = new Date(creationTime + KST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// 지정한 연/월에 "실제로 진행된" 리그 경기 수 + 참여한 내전/클전 개수를 실시간 집계.
// 대상은 전체 사용자(경기가 없으면 0점으로 표시).
export const getMonthlyAwards = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const beforeStart =
      args.year < AWARDS_START_YEAR ||
      (args.year === AWARDS_START_YEAR && args.month < AWARDS_START_MONTH);

    type Count = { leagueGames: number; innerwarIds: Set<string>; clanwarIds: Set<string> };
    const counts = new Map<string, Count>();
    function entryFor(userId: string): Count {
      let c = counts.get(userId);
      if (!c) {
        c = { leagueGames: 0, innerwarIds: new Set(), clanwarIds: new Set() };
        counts.set(userId, c);
      }
      return c;
    }

    if (!beforeStart) {
      // 리그: 실제로 치른 경기 수
      const allLeagues = await ctx.db.query("leagues").take(500);
      const validLeagueIds = new Set(
        allLeagues.filter((l) => !l.deletedAt).map((l) => l._id)
      );

      const allScores = await ctx.db.query("scores").take(5000);
      for (const s of allScores) {
        if (!validLeagueIds.has(s.leagueId)) continue;
        const ym = kstYearMonth(s._creationTime);
        if (ym.year !== args.year || ym.month !== args.month) continue;
        entryFor(s.homeUserId).leagueGames++;
        entryFor(s.awayUserId).leagueGames++;
      }

      // 내전: 참여한(실제 경기를 치른) 내전 개수 — 경기 수가 아니라 distinct 내전 수
      const allInnerwars = await ctx.db.query("innerwars").take(500);
      const validInnerwarIds = new Set(
        allInnerwars.filter((w) => !w.deletedAt).map((w) => w._id)
      );

      const allInnerwarMatches = await ctx.db.query("innerwarMatches").take(5000);
      for (const m of allInnerwarMatches) {
        if (m.status !== "done") continue;
        if (!validInnerwarIds.has(m.innerwarId)) continue;
        const ym = kstYearMonth(m._creationTime);
        if (ym.year !== args.year || ym.month !== args.month) continue;
        entryFor(m.playerAId).innerwarIds.add(m.innerwarId);
        entryFor(m.playerBId).innerwarIds.add(m.innerwarId);
      }

      // 클전: 참여한(실제 경기를 치른) 클전 개수. 타클랜 등록 선수(로그인 없음)는 집계 대상에서 제외.
      const allClanwars = await ctx.db.query("clanwars").take(500);
      const validClanwarIds = new Set(
        allClanwars.filter((w) => !w.deletedAt).map((w) => w._id)
      );

      const allClanwarParticipants = await ctx.db.query("clanwarParticipants").take(5000);
      const participantUserMap = new Map<string, Id<"users">>();
      for (const p of allClanwarParticipants) {
        if (p.sourceType === "user" && p.userId) {
          participantUserMap.set(p._id, p.userId);
        }
      }

      const allClanwarMatches = await ctx.db.query("clanwarMatches").take(5000);
      for (const m of allClanwarMatches) {
        if (m.status !== "done") continue;
        if (!validClanwarIds.has(m.clanwarId)) continue;
        const ym = kstYearMonth(m._creationTime);
        if (ym.year !== args.year || ym.month !== args.month) continue;
        const homeUserId = participantUserMap.get(m.homeParticipantId);
        const awayUserId = participantUserMap.get(m.awayParticipantId);
        if (homeUserId) entryFor(homeUserId).clanwarIds.add(m.clanwarId);
        if (awayUserId) entryFor(awayUserId).clanwarIds.add(m.clanwarId);
      }
    }

    // 대상은 전원 — 경기가 없는 사용자도 0점으로 함께 표시
    const allUsers = await ctx.db.query("users").take(500);
    const entries = allUsers.map((u) => {
      const c = counts.get(u._id) ?? {
        leagueGames: 0,
        innerwarIds: new Set<string>(),
        clanwarIds: new Set<string>(),
      };
      const innerwarParticipations = c.innerwarIds.size;
      const clanwarParticipations = c.clanwarIds.size;
      const score =
        c.leagueGames * POINTS_PER_LEAGUE_GAME +
        innerwarParticipations * POINTS_PER_INNERWAR_PARTICIPATION +
        clanwarParticipations * POINTS_PER_CLANWAR_PARTICIPATION;
      return {
        userId: u._id,
        user: u,
        leagueGames: c.leagueGames,
        innerwarParticipations,
        clanwarParticipations,
        score,
      };
    });

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.leagueGames !== a.leagueGames) return b.leagueGames - a.leagueGames;
      if (b.innerwarParticipations !== a.innerwarParticipations) {
        return b.innerwarParticipations - a.innerwarParticipations;
      }
      return b.clanwarParticipations - a.clanwarParticipations;
    });

    return {
      entries,
      pointsPerLeagueGame: POINTS_PER_LEAGUE_GAME,
      pointsPerInnerwarParticipation: POINTS_PER_INNERWAR_PARTICIPATION,
      pointsPerClanwarParticipation: POINTS_PER_CLANWAR_PARTICIPATION,
    };
  },
});
