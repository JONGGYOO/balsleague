import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { getEffectiveRole, SUPER_ADMIN_EMAIL } from "./utils";

// 클랜전은 참가자가 로그인하지 않는 타클랜 인원(otherClanUsers)일 수 있어
// 내전처럼 "현재 경기 당사자도 입력 가능" 규칙을 대칭적으로 적용할 수 없다.
// 따라서 모든 변경 작업은 관리자(superAdmin/admin) 전용으로 통일한다.
async function assertManager(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");
  const role = await getEffectiveRole(ctx);
  if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
}

export const getClanwarsPageData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return { user: null, clanwars: [] };

    const email = identity.email ?? user.email ?? "";
    const effectiveRole: "superAdmin" | "admin" | "innerwarAdmin" | "user" =
      email === SUPER_ADMIN_EMAIL
        ? "superAdmin"
        : user.role === "admin"
          ? "admin"
          : user.role === "innerwarAdmin"
            ? "innerwarAdmin"
            : "user";

    const all = await ctx.db.query("clanwars").order("desc").take(200);
    const clanwars = all.filter((w) => !w.deletedAt);

    // 8-11-3: 일반매치는 clanwar.winnerSide가 없으므로(전체 승패 개념 없음) 목록에서
    // "누가 이겼는지" 보여주기 위해 완료된 일반매치 클전의 개인전 결과를 집계해 전달한다.
    const doneNormalMatchIds = new Set(
      clanwars.filter((w) => w.status === "done" && w.gameMode === "normalMatch").map((w) => w._id)
    );
    const normalTallyMap = new Map<string, { homeWins: number; awayWins: number; draws: number }>();
    if (doneNormalMatchIds.size > 0) {
      const allMatches = await ctx.db.query("clanwarMatches").take(5000);
      for (const m of allMatches) {
        if (m.status !== "done" || !doneNormalMatchIds.has(m.clanwarId)) continue;
        const t = normalTallyMap.get(m.clanwarId) ?? { homeWins: 0, awayWins: 0, draws: 0 };
        if (m.result === "home") t.homeWins++;
        else if (m.result === "away") t.awayWins++;
        else t.draws++;
        normalTallyMap.set(m.clanwarId, t);
      }
    }

    const clanwarsWithResult = clanwars.map((w) => ({
      ...w,
      normalTally: normalTallyMap.get(w._id) ?? null,
    }));

    return { user: { ...user, effectiveRole, email }, clanwars: clanwarsWithResult };
  },
});

export const getDetail = query({
  args: { clanwarId: v.id("clanwars") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clanwar = await ctx.db.get(args.clanwarId);
    if (!clanwar || clanwar.deletedAt) return null;

    const role = await getEffectiveRole(ctx);
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const allParticipants = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(200);

    const participantsEnriched = await Promise.all(
      allParticipants.map(async (p) => {
        if (p.sourceType === "user" && p.userId) {
          const user = await ctx.db.get(p.userId);
          return {
            ...p,
            displayName: user?.nickname ?? user?.name ?? "이름 없음",
            leagueWins: user?.leagueWins,
            user,
            otherClanUser: null,
          };
        }
        const otherClanUser = p.otherClanUserId ? await ctx.db.get(p.otherClanUserId) : null;
        return {
          ...p,
          displayName: otherClanUser?.nickname ?? "이름 없음",
          leagueWins: undefined,
          user: null,
          otherClanUser,
        };
      })
    );

    const participantMap = new Map(participantsEnriched.map((p) => [p._id, p]));

    const matches = await ctx.db
      .query("clanwarMatches")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(500);

    const matchesEnriched = matches.map((m) => ({
      ...m,
      home: participantMap.get(m.homeParticipantId) ?? null,
      away: participantMap.get(m.awayParticipantId) ?? null,
      winner: m.winnerParticipantId ? participantMap.get(m.winnerParticipantId) ?? null : null,
    }));

    return {
      clanwar,
      participants: participantsEnriched,
      matches: matchesEnriched.sort((a, b) => a.matchIndex - b.matchIndex),
      currentUser: currentUser ? { ...currentUser, effectiveRole: role } : null,
    };
  },
});

export const create = mutation({
  args: {
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    gameMode: v.union(v.literal("deathmatch"), v.literal("normalMatch")),
    homeClanName: v.string(),
    awayClanName: v.string(),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const homeClanName = args.homeClanName.trim();
    const awayClanName = args.awayClanName.trim();
    if (!homeClanName || !awayClanName) throw new Error("홈/어웨이 클랜을 선택해주세요.");
    if (homeClanName === awayClanName) throw new Error("홈/어웨이 클랜은 서로 달라야 합니다.");

    return await ctx.db.insert("clanwars", {
      year: args.year,
      month: args.month,
      day: args.day,
      name: args.name,
      createdBy: identity!.tokenIdentifier,
      gameMode: args.gameMode,
      homeClanName,
      awayClanName,
      status: "draft",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("clanwars"),
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    gameMode: v.union(v.literal("deathmatch"), v.literal("normalMatch")),
    homeClanName: v.string(),
    awayClanName: v.string(),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const homeClanName = args.homeClanName.trim();
    const awayClanName = args.awayClanName.trim();
    if (!homeClanName || !awayClanName) throw new Error("홈/어웨이 클랜을 선택해주세요.");
    if (homeClanName === awayClanName) throw new Error("홈/어웨이 클랜은 서로 달라야 합니다.");

    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, homeClanName, awayClanName });
  },
});

export const remove = mutation({
  args: { id: v.id("clanwars") },
  handler: async (ctx, args) => {
    await assertManager(ctx);
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

// 로스터 추가 — 내전의 참가신청/승인과 달리 관리자가 직접 후보를 골라 담는다.
// 클랜명 일치 여부는 백엔드에서 강제 검증하지 않는다 — 픽커 UI가 기본적으로 해당
// side의 클랜명과 일치하는 후보만 보여주는 방식으로 유도하고, 필요하면 관리자가
// 전체 목록에서 수동으로 찾아 추가할 수 있게 둔다 (프로필 organization 표기가
// 클랜명과 미세하게 다르거나 비어있는 실제 데이터 상황을 감안).
export const addParticipant = mutation({
  args: {
    clanwarId: v.id("clanwars"),
    side: v.union(v.literal("home"), v.literal("away")),
    sourceType: v.union(v.literal("user"), v.literal("otherClanUser")),
    userId: v.optional(v.id("users")),
    otherClanUserId: v.optional(v.id("otherClanUsers")),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const clanwar = await ctx.db.get(args.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.status !== "draft") {
      throw new Error("로스터 구성 중(경기 시작 전)에만 참가자를 추가할 수 있습니다.");
    }

    if (args.sourceType === "user" && !args.userId) throw new Error("사용자를 선택해주세요.");
    if (args.sourceType === "otherClanUser" && !args.otherClanUserId) {
      throw new Error("선수를 선택해주세요.");
    }

    const existing = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(200);

    const duplicate = existing.some(
      (p) =>
        (args.sourceType === "user" && p.sourceType === "user" && p.userId === args.userId) ||
        (args.sourceType === "otherClanUser" &&
          p.sourceType === "otherClanUser" &&
          p.otherClanUserId === args.otherClanUserId)
    );
    if (duplicate) throw new Error("이미 추가된 참가자입니다.");

    const maxOrder = existing
      .filter((p) => p.side === args.side)
      .reduce((max, p) => Math.max(max, p.teamOrder ?? -1), -1);

    await ctx.db.insert("clanwarParticipants", {
      clanwarId: args.clanwarId,
      side: args.side,
      sourceType: args.sourceType,
      userId: args.sourceType === "user" ? args.userId : undefined,
      otherClanUserId: args.sourceType === "otherClanUser" ? args.otherClanUserId : undefined,
      teamOrder: maxOrder + 1,
    });
  },
});

export const removeParticipant = mutation({
  args: { participantId: v.id("clanwarParticipants") },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");

    const clanwar = await ctx.db.get(participant.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.status === "done") throw new Error("종료된 클전의 참가자는 제외할 수 없습니다.");

    const sameClanwar = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", participant.clanwarId))
      .take(200);
    const sideMembers = sameClanwar
      .filter((p) => p.side === participant.side)
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const idx = sideMembers.findIndex((p) => p._id === args.participantId);
    if (idx === -1) return;

    if (clanwar.status === "inProgress") {
      const currentIndexForSide =
        participant.side === "home" ? (clanwar.currentIndexHome ?? 0) : (clanwar.currentIndexAway ?? 0);
      if (idx <= currentIndexForSide) {
        throw new Error("이미 경기했거나 현재 경기 중인 참가자는 제외할 수 없습니다.");
      }
    }

    await ctx.db.delete(args.participantId);

    const remaining = sideMembers.filter((p) => p._id !== args.participantId);
    for (let i = 0; i < remaining.length; i++) {
      if ((remaining[i].teamOrder ?? i) !== i) {
        await ctx.db.patch(remaining[i]._id, { teamOrder: i });
      }
    }
  },
});

// 8-11-4: 순번 변경은 관리자뿐 아니라 로그인한 모든 사용자가 가능
export const reorderParticipant = mutation({
  args: {
    participantId: v.id("clanwarParticipants"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");
    if (participant.orderLocked) throw new Error("고정된 순번은 해제 후 이동할 수 있습니다.");

    const clanwar = await ctx.db.get(participant.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.status === "done") throw new Error("경기가 종료되어 순번을 변경할 수 없습니다.");

    const side = participant.side;
    const allInClanwar = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", participant.clanwarId))
      .take(200);
    const sideMembers = allInClanwar
      .filter((p) => p.side === side)
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const currentIdx = sideMembers.findIndex((p) => p._id === args.participantId);
    if (currentIdx === -1) return;

    const step = args.direction === "up" ? -1 : 1;
    let targetIdx = currentIdx + step;
    while (targetIdx >= 0 && targetIdx < sideMembers.length && sideMembers[targetIdx].orderLocked) {
      targetIdx += step;
    }
    if (targetIdx < 0 || targetIdx >= sideMembers.length) return;

    let activeMatchToUpdate: Doc<"clanwarMatches"> | null = null;
    let currentIndexForSide = -1;

    if (clanwar.status === "inProgress") {
      currentIndexForSide =
        side === "home" ? (clanwar.currentIndexHome ?? 0) : (clanwar.currentIndexAway ?? 0);

      if (currentIdx < currentIndexForSide || targetIdx < currentIndexForSide) {
        throw new Error("이미 경기를 진행한 참가자는 순번을 변경할 수 없습니다.");
      }

      if (currentIdx === currentIndexForSide || targetIdx === currentIndexForSide) {
        const matches = await ctx.db
          .query("clanwarMatches")
          .withIndex("by_clanwar", (q) => q.eq("clanwarId", participant.clanwarId))
          .take(500);
        const active = matches.find((m) => m.status === "pending" || m.status === "scored") ?? null;
        if (!active || active.status === "scored") {
          throw new Error("이미 점수를 저장한 참가자는 순번을 변경할 수 없습니다.");
        }
        activeMatchToUpdate = active;
      }
    }

    const current = sideMembers[currentIdx];
    const target = sideMembers[targetIdx];
    const currentOrder = current.teamOrder ?? currentIdx;
    const targetOrder = target.teamOrder ?? targetIdx;

    await ctx.db.patch(current._id, { teamOrder: targetOrder });
    await ctx.db.patch(target._id, { teamOrder: currentOrder });

    if (activeMatchToUpdate) {
      const newActiveParticipant = currentIdx === currentIndexForSide ? target : current;
      await ctx.db.patch(
        activeMatchToUpdate._id,
        side === "home"
          ? { homeParticipantId: newActiveParticipant._id }
          : { awayParticipantId: newActiveParticipant._id }
      );
    }
  },
});

export const toggleOrderLock = mutation({
  args: { participantId: v.id("clanwarParticipants") },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const participant = await ctx.db.get(args.participantId);
    if (!participant) throw new Error("참가자를 찾을 수 없습니다.");

    const clanwar = await ctx.db.get(participant.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.status === "done") {
      throw new Error("경기가 종료되어 순번 고정을 변경할 수 없습니다.");
    }

    await ctx.db.patch(args.participantId, { orderLocked: !participant.orderLocked });
  },
});

export const startGame = mutation({
  args: { clanwarId: v.id("clanwars") },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const clanwar = await ctx.db.get(args.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.status !== "draft") throw new Error("이미 시작된 클전입니다.");

    const allParticipants = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(200);
    const home = allParticipants
      .filter((p) => p.side === "home")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const away = allParticipants
      .filter((p) => p.side === "away")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    if (home.length === 0 || away.length === 0) {
      throw new Error("홈/어웨이 양쪽에 최소 1명 이상이 필요합니다.");
    }

    const existingMatches = await ctx.db
      .query("clanwarMatches")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    await ctx.db.insert("clanwarMatches", {
      clanwarId: args.clanwarId,
      homeParticipantId: home[0]._id,
      awayParticipantId: away[0]._id,
      matchIndex: 0,
      status: "pending",
    });

    await ctx.db.patch(args.clanwarId, {
      status: "inProgress",
      currentIndexHome: 0,
      currentIndexAway: 0,
      winnerSide: undefined,
    });
  },
});

// 내전의 resetTeams와 달리 참가자의 side/teamOrder/orderLocked는 건드리지 않는다 —
// 클랜전은 랜덤/성적기반 자동배정 같은 "재배정" 액션이 없어, 로스터를 되돌리면
// 다시 채울 방법이 없다. 되돌리는 것은 어디까지나 "진행 상태"(매치·인덱스·승자)뿐.
export const resetTeams = mutation({
  args: { clanwarId: v.id("clanwars") },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const clanwar = await ctx.db.get(args.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");

    const existingMatches = await ctx.db
      .query("clanwarMatches")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", args.clanwarId))
      .take(500);
    for (const m of existingMatches) {
      await ctx.db.delete(m._id);
    }

    await ctx.db.patch(args.clanwarId, {
      status: "draft",
      currentIndexHome: undefined,
      currentIndexAway: undefined,
      winnerSide: undefined,
    });
  },
});

// ── 데스매치: 내전과 동일 — 이긴 쪽은 자리를 지키고(승자 인덱스 유지),
// 진 쪽만 다음 참가자로 교체. 무승부는 양쪽 모두 다음 참가자로 진행("동반 탈락").
export const saveDeathmatchScore = mutation({
  args: {
    matchId: v.id("clanwarMatches"),
    scoreHome: v.number(),
    scoreAway: v.number(),
    broadcastUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status === "done") throw new Error("이미 확정된 경기입니다.");

    const clanwar = await ctx.db.get(match.clanwarId);
    if (!clanwar || clanwar.gameMode !== "deathmatch") throw new Error("데스매치 클전이 아닙니다.");

    const broadcastUrl = args.broadcastUrl?.trim() || undefined;

    const isDraw = args.scoreHome === args.scoreAway;
    if (isDraw) {
      await ctx.db.replace(args.matchId, {
        clanwarId: match.clanwarId,
        homeParticipantId: match.homeParticipantId,
        awayParticipantId: match.awayParticipantId,
        matchIndex: match.matchIndex,
        scoreHome: args.scoreHome,
        scoreAway: args.scoreAway,
        status: "scored",
        broadcastUrl,
      });
    } else {
      const winnerParticipantId =
        args.scoreHome > args.scoreAway ? match.homeParticipantId : match.awayParticipantId;
      await ctx.db.patch(args.matchId, {
        scoreHome: args.scoreHome,
        scoreAway: args.scoreAway,
        winnerParticipantId,
        status: "scored",
        broadcastUrl,
      });
    }
  },
});

export const confirmDeathmatchResult = mutation({
  args: { matchId: v.id("clanwarMatches") },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status === "done") throw new Error("이미 확정된 경기입니다.");
    if (match.status !== "scored") throw new Error("점수를 먼저 입력하세요.");
    if (match.scoreHome === undefined || match.scoreAway === undefined) {
      throw new Error("점수가 입력되지 않았습니다.");
    }

    const clanwar = await ctx.db.get(match.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.gameMode !== "deathmatch") throw new Error("데스매치 클전이 아닙니다.");

    const allParticipants = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", match.clanwarId))
      .take(200);
    const home = allParticipants
      .filter((p) => p.side === "home")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const away = allParticipants
      .filter((p) => p.side === "away")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const currentIndexHome = clanwar.currentIndexHome ?? 0;
    const currentIndexAway = clanwar.currentIndexAway ?? 0;
    const isDraw = match.scoreHome === match.scoreAway;

    if (isDraw) {
      await ctx.db.patch(args.matchId, { status: "done" });

      const nextHome = currentIndexHome + 1;
      const nextAway = currentIndexAway + 1;

      const homeDone = nextHome >= home.length;
      const awayDone = nextAway >= away.length;

      if (homeDone && awayDone) {
        // 양쪽 모두 마지막 참가자였던 경기가 동점 — 클전 전체를 무승부로 종료
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "draw",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }
      if (homeDone) {
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "away",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }
      if (awayDone) {
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "home",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }

      await ctx.db.insert("clanwarMatches", {
        clanwarId: match.clanwarId,
        homeParticipantId: home[nextHome]._id,
        awayParticipantId: away[nextAway]._id,
        matchIndex: match.matchIndex + 1,
        status: "pending",
      });
      await ctx.db.patch(match.clanwarId, { currentIndexHome: nextHome, currentIndexAway: nextAway });
      return;
    }

    const isHomeWinner = match.scoreHome > match.scoreAway;
    const winnerParticipantId = isHomeWinner ? match.homeParticipantId : match.awayParticipantId;
    await ctx.db.patch(args.matchId, { winnerParticipantId, status: "done" });

    let nextIndexHome = currentIndexHome;
    let nextIndexAway = currentIndexAway;
    if (isHomeWinner) {
      nextIndexAway++;
    } else {
      nextIndexHome++;
    }

    if (nextIndexHome >= home.length) {
      await ctx.db.patch(match.clanwarId, {
        status: "done",
        winnerSide: "away",
        currentIndexHome: nextIndexHome,
        currentIndexAway: nextIndexAway,
      });
      return;
    }
    if (nextIndexAway >= away.length) {
      await ctx.db.patch(match.clanwarId, {
        status: "done",
        winnerSide: "home",
        currentIndexHome: nextIndexHome,
        currentIndexAway: nextIndexAway,
      });
      return;
    }

    await ctx.db.insert("clanwarMatches", {
      clanwarId: match.clanwarId,
      homeParticipantId: home[nextIndexHome]._id,
      awayParticipantId: away[nextIndexAway]._id,
      matchIndex: match.matchIndex + 1,
      status: "pending",
    });
    await ctx.db.patch(match.clanwarId, {
      currentIndexHome: nextIndexHome,
      currentIndexAway: nextIndexAway,
    });
  },
});

// 점수 저장 → 다음 경기 진행 직후, 방금 확정된(바로 이전) 경기의 점수를 다시 고칠 수
// 있도록 함. innerwars.editLastMatch와 동일 패턴.
export const editLastDeathmatchResult = mutation({
  args: {
    matchId: v.id("clanwarMatches"),
    scoreHome: v.number(),
    scoreAway: v.number(),
    broadcastUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.scoreHome < 0 || args.scoreAway < 0) {
      throw new Error("점수는 0 이상이어야 합니다.");
    }
    await assertManager(ctx);

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status !== "done") throw new Error("확정된 경기만 수정할 수 있습니다.");
    const broadcastUrl = args.broadcastUrl?.trim() || undefined;

    const clanwar = await ctx.db.get(match.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.gameMode !== "deathmatch") throw new Error("데스매치 클전이 아닙니다.");

    const allMatches = await ctx.db
      .query("clanwarMatches")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", match.clanwarId))
      .take(500);
    const nextMatch = allMatches.find((m) => m.matchIndex === match.matchIndex + 1) ?? null;
    if (nextMatch && nextMatch.status !== "pending") {
      throw new Error("다음 경기가 이미 진행되어 이전 경기를 수정할 수 없습니다.");
    }

    const allParticipants = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", match.clanwarId))
      .take(200);
    const home = allParticipants
      .filter((p) => p.side === "home")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const away = allParticipants
      .filter((p) => p.side === "away")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const beforeIndexHome = home.findIndex((p) => p._id === match.homeParticipantId);
    const beforeIndexAway = away.findIndex((p) => p._id === match.awayParticipantId);
    if (beforeIndexHome === -1 || beforeIndexAway === -1) {
      throw new Error("경기 참가자 정보를 찾을 수 없습니다.");
    }

    if (nextMatch) {
      await ctx.db.delete(nextMatch._id);
    }

    const isDraw = args.scoreHome === args.scoreAway;

    if (isDraw) {
      await ctx.db.replace(args.matchId, {
        clanwarId: match.clanwarId,
        homeParticipantId: match.homeParticipantId,
        awayParticipantId: match.awayParticipantId,
        matchIndex: match.matchIndex,
        scoreHome: args.scoreHome,
        scoreAway: args.scoreAway,
        status: "done",
        broadcastUrl,
      });

      const nextHome = beforeIndexHome + 1;
      const nextAway = beforeIndexAway + 1;

      const homeDone = nextHome >= home.length;
      const awayDone = nextAway >= away.length;

      if (homeDone && awayDone) {
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "draw",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }
      if (homeDone) {
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "away",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }
      if (awayDone) {
        await ctx.db.patch(match.clanwarId, {
          status: "done",
          winnerSide: "home",
          currentIndexHome: nextHome,
          currentIndexAway: nextAway,
        });
        return;
      }

      await ctx.db.insert("clanwarMatches", {
        clanwarId: match.clanwarId,
        homeParticipantId: home[nextHome]._id,
        awayParticipantId: away[nextAway]._id,
        matchIndex: match.matchIndex + 1,
        status: "pending",
      });
      await ctx.db.patch(match.clanwarId, {
        status: "inProgress",
        winnerSide: undefined,
        currentIndexHome: nextHome,
        currentIndexAway: nextAway,
      });
      return;
    }

    const isHomeWinner = args.scoreHome > args.scoreAway;
    const winnerParticipantId = isHomeWinner ? match.homeParticipantId : match.awayParticipantId;
    await ctx.db.patch(args.matchId, {
      scoreHome: args.scoreHome,
      scoreAway: args.scoreAway,
      winnerParticipantId,
      status: "done",
      broadcastUrl,
    });

    const nextIndexHome = beforeIndexHome + (isHomeWinner ? 0 : 1);
    const nextIndexAway = beforeIndexAway + (isHomeWinner ? 1 : 0);

    if (nextIndexHome >= home.length) {
      await ctx.db.patch(match.clanwarId, {
        status: "done",
        winnerSide: "away",
        currentIndexHome: nextIndexHome,
        currentIndexAway: nextIndexAway,
      });
      return;
    }
    if (nextIndexAway >= away.length) {
      await ctx.db.patch(match.clanwarId, {
        status: "done",
        winnerSide: "home",
        currentIndexHome: nextIndexHome,
        currentIndexAway: nextIndexAway,
      });
      return;
    }

    await ctx.db.insert("clanwarMatches", {
      clanwarId: match.clanwarId,
      homeParticipantId: home[nextIndexHome]._id,
      awayParticipantId: away[nextIndexAway]._id,
      matchIndex: match.matchIndex + 1,
      status: "pending",
    });
    await ctx.db.patch(match.clanwarId, {
      status: "inProgress",
      winnerSide: undefined,
      currentIndexHome: nextIndexHome,
      currentIndexAway: nextIndexAway,
    });
  },
});

// ── 일반매치: 승패와 무관하게 홈[i] vs 어웨이[i] 고정 대진으로 양쪽 인덱스가
// 항상 함께 전진한다. 점수 없이 결과만 즉시 확정(별도 확인 단계 없음).
// 전체 클전 승패 개념은 없다 — 개인전 기록만 남기고 로스터가 짧은 쪽 기준으로
// 대진이 끝나면 종료.
export const submitNormalMatchResult = mutation({
  args: {
    matchId: v.id("clanwarMatches"),
    result: v.union(v.literal("home"), v.literal("away"), v.literal("draw")),
    broadcastUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status === "done") throw new Error("이미 확정된 경기입니다.");

    const clanwar = await ctx.db.get(match.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.gameMode !== "normalMatch") throw new Error("일반매치 클전이 아닙니다.");

    const allParticipants = await ctx.db
      .query("clanwarParticipants")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", match.clanwarId))
      .take(200);
    const home = allParticipants
      .filter((p) => p.side === "home")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));
    const away = allParticipants
      .filter((p) => p.side === "away")
      .sort((a, b) => (a.teamOrder ?? 0) - (b.teamOrder ?? 0));

    const winnerParticipantId =
      args.result === "home"
        ? match.homeParticipantId
        : args.result === "away"
          ? match.awayParticipantId
          : undefined;

    await ctx.db.patch(args.matchId, {
      result: args.result,
      winnerParticipantId,
      status: "done",
      broadcastUrl: args.broadcastUrl?.trim() || undefined,
    });

    // 양쪽 인덱스는 항상 함께 전진하므로 둘은 항상 같은 값을 유지한다.
    const nextIndex = (clanwar.currentIndexHome ?? 0) + 1;

    if (nextIndex >= home.length || nextIndex >= away.length) {
      await ctx.db.patch(match.clanwarId, {
        status: "done",
        currentIndexHome: nextIndex,
        currentIndexAway: nextIndex,
      });
      return;
    }

    await ctx.db.insert("clanwarMatches", {
      clanwarId: match.clanwarId,
      homeParticipantId: home[nextIndex]._id,
      awayParticipantId: away[nextIndex]._id,
      matchIndex: match.matchIndex + 1,
      status: "pending",
    });
    await ctx.db.patch(match.clanwarId, {
      currentIndexHome: nextIndex,
      currentIndexAway: nextIndex,
    });
  },
});

// 일반매치는 결과가 바뀌어도(홈승↔무↔원정승) 다음 대진 참가자가 달라지지 않는다
// (인덱스가 승패와 무관하게 항상 함께 전진하므로) — 그래서 데스매치의 수정과 달리
// 다음 매치를 지우고 재계산할 필요 없이 이 매치의 결과 필드만 바꾸면 된다.
export const editLastNormalMatchResult = mutation({
  args: {
    matchId: v.id("clanwarMatches"),
    result: v.union(v.literal("home"), v.literal("away"), v.literal("draw")),
    broadcastUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("경기를 찾을 수 없습니다.");
    if (match.status !== "done") throw new Error("확정된 경기만 수정할 수 있습니다.");

    const clanwar = await ctx.db.get(match.clanwarId);
    if (!clanwar) throw new Error("클전을 찾을 수 없습니다.");
    if (clanwar.gameMode !== "normalMatch") throw new Error("일반매치 클전이 아닙니다.");

    const allMatches = await ctx.db
      .query("clanwarMatches")
      .withIndex("by_clanwar", (q) => q.eq("clanwarId", match.clanwarId))
      .take(500);
    const nextMatch = allMatches.find((m) => m.matchIndex === match.matchIndex + 1) ?? null;
    if (nextMatch && nextMatch.status !== "pending") {
      throw new Error("다음 경기가 이미 진행되어 이전 경기를 수정할 수 없습니다.");
    }

    const winnerParticipantId =
      args.result === "home"
        ? match.homeParticipantId
        : args.result === "away"
          ? match.awayParticipantId
          : undefined;

    await ctx.db.replace(args.matchId, {
      clanwarId: match.clanwarId,
      homeParticipantId: match.homeParticipantId,
      awayParticipantId: match.awayParticipantId,
      matchIndex: match.matchIndex,
      result: args.result,
      winnerParticipantId,
      status: "done",
      broadcastUrl: args.broadcastUrl?.trim() || undefined,
    });
  },
});
