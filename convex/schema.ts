import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    organization: v.optional(v.string()),
    // superAdmin은 이메일로 판단. innerwarAdmin은 내전 추가만 가능한 역할.
    role: v.optional(v.union(v.literal("admin"), v.literal("innerwarAdmin"))),
    profileSaved: v.optional(v.boolean()),
    birthYear: v.optional(v.number()),
    birthMonth: v.optional(v.number()),
    birthDay: v.optional(v.number()),
    phone: v.optional(v.string()),
    // 리그 종료 시 1위로 확정된 횟수 — 닉네임 옆 별/왕관 표시에 사용
    leagueWins: v.optional(v.number()),
  }).index("by_token", ["tokenIdentifier"]),

  organizations: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  // 타클랜사용자: 로그인은 하지 않지만 차후 클랜전 관리를 위해 관리자가 클랜별로 등록해두는 인원
  otherClanUsers: defineTable({
    organizationName: v.string(),
    nickname: v.string(),
    name: v.optional(v.string()),
    previousNickname: v.optional(v.string()),
    // 실력 평가: 초고수(god) / 고수(high) / 중수(mid) / 하수(low)
    skillTier: v.optional(
      v.union(v.literal("god"), v.literal("high"), v.literal("mid"), v.literal("low"))
    ),
    memo: v.optional(v.string()),
    createdBy: v.string(),
  }).index("by_organization", ["organizationName"]),

  leagues: defineTable({
    year: v.number(),
    month: v.number(),
    name: v.string(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()), // 소프트 삭제용 타임스탬프
    // 종료된 리그는 순위가 확정되고 우승자에게 leagueWins가 지급됨.
    // 종료 후에도 관리자는 계속 스코어를 입력/수정할 수 있음 (일반 사용자만 차단)
    status: v.optional(v.union(v.literal("ongoing"), v.literal("ended"))),
    endedAt: v.optional(v.number()),
    winnerUserId: v.optional(v.id("users")),
  }).index("by_year_month", ["year", "month"]),

  leagueParticipants: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"))),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_and_user", ["leagueId", "userId"])
    .index("by_user", ["userId"]),

  scores: defineTable({
    leagueId: v.id("leagues"),
    homeUserId: v.id("users"),
    homeScore: v.number(),
    awayUserId: v.id("users"),
    awayScore: v.number(),
  }).index("by_league", ["leagueId"]),

  innerwars: defineTable({
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("teamAssigned"),
        v.literal("inProgress"),
        v.literal("done"),
      )
    ),
    winnerTeam: v.optional(v.union(v.literal("A"), v.literal("B"))),
    currentIndexA: v.optional(v.number()),
    currentIndexB: v.optional(v.number()),
    // 팀 배정/초기화 권한: "admin"=관리자만, "all"=모든 사용자
    teamAssignPermission: v.optional(v.union(v.literal("admin"), v.literal("all"))),
    betItem: v.optional(v.string()),
    // true면 참가자가 참가 신청 시 "리그 적용 경기"를 선택할 수 있고, 둘 다 선택한 경기는
    // 종료 시 진행 중인 공통 리그의 정식 경기 기록(scores)으로 자동 반영된다.
    leagueApplicable: v.optional(v.boolean()),
  }).index("by_year_month", ["year", "month"]),

  innerwarParticipants: defineTable({
    innerwarId: v.id("innerwars"),
    userId: v.id("users"),
    // 참가 신청 시 "리그 적용 경기를 하시겠습니까?"에 대한 응답 (leagueApplicable 내전에서만 의미 있음)
    wantsLeagueMatch: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"))),
    team: v.optional(v.union(v.literal("A"), v.literal("B"))),
    teamOrder: v.optional(v.number()),
    // 경기 시작 전 순번 고정 — 고정된 순번은 다른 인원이 스왑해서 들어올 수 없고,
    // 순번 이동 시 고정된 자리를 건너뛰어 다음 빈 자리로 이동한다
    orderLocked: v.optional(v.boolean()),
    // 성적기반 배정 시점의 점수 스냅샷 (리그:내전 가중치는 Grade.md 참고, 실제 비율은
    // convex/innerwars.ts의 SCORE_WEIGHT_LEAGUE/SCORE_WEIGHT_INNERWAR 상수가 정답)
    // 랜덤/수동 배정 시에는 초기화되어 undefined가 됨
    assignScore: v.optional(v.number()),
    assignLeagueRate: v.optional(v.number()),
    assignInnerwarRate: v.optional(v.number()),
    assignRank: v.optional(v.number()),
    // 리그/내전 경기 기록이 전혀 없는 참가자인지 여부 — true면 배정 순위를 최하위로 고정
    assignHasHistory: v.optional(v.boolean()),
    // 배정 당시 실제 경기 수 (0이면 화면에서 배점 대신 "-"로 표시)
    assignLeagueGames: v.optional(v.number()),
    assignInnerwarGames: v.optional(v.number()),
  })
    .index("by_innerwar", ["innerwarId"])
    .index("by_innerwar_and_user", ["innerwarId", "userId"])
    .index("by_user", ["userId"]),

  innerwarMatches: defineTable({
    innerwarId: v.id("innerwars"),
    playerAId: v.id("users"),
    playerBId: v.id("users"),
    scoreA: v.optional(v.number()),
    scoreB: v.optional(v.number()),
    winnerId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("pending"), v.literal("scored"), v.literal("done"))),
    matchIndex: v.number(),
    // 경기 종료 시 둘 다 리그 적용을 선택했고, 공통으로 참가 중인 진행 중 리그가 있으면 true.
    // reflectedScoreId는 이 경기 때문에 새로 만들어진 scores row가 있을 때만 설정된다
    // (둘 사이에 이미 그 리그 경기 기록이 있었다면 중복 등록하지 않고 reflectedScoreId 없이
    // leagueReflected만 true로 표시한다 — 그 기존 기록은 이 내전 경기가 소유한 게 아니므로
    // 이후 이 경기의 점수를 수정해도 건드리지 않는다).
    leagueReflected: v.optional(v.boolean()),
    reflectedScoreId: v.optional(v.id("scores")),
  })
    .index("by_innerwar", ["innerwarId"])
    .index("by_innerwar_and_index", ["innerwarId", "matchIndex"]),

  // 클랜전: 타 클랜과의 공식 대결. 내전과 달리 참가자가 두 소스(등록 사용자 /
  // 타클랜 등록 선수)에서 오고, 관리자가 로스터를 직접 구성한다 (자율 참가 없음).
  clanwars: defineTable({
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()),
    gameMode: v.union(v.literal("deathmatch"), v.literal("normalMatch")),
    homeClanName: v.string(),
    awayClanName: v.string(),
    status: v.optional(v.union(v.literal("draft"), v.literal("inProgress"), v.literal("done"))),
    // deathmatch(로스터 소진 방식)에서만 설정됨. normalMatch(고정 대진표)는
    // 전체 승패 개념이 없어 항상 undefined. 마지막 경기가 동점이면 양쪽이 동시에
    // 소진되므로 "draw"로 설정된다.
    winnerSide: v.optional(v.union(v.literal("home"), v.literal("away"), v.literal("draw"))),
    currentIndexHome: v.optional(v.number()),
    currentIndexAway: v.optional(v.number()),
  }).index("by_year_month", ["year", "month"]),

  clanwarParticipants: defineTable({
    clanwarId: v.id("clanwars"),
    side: v.union(v.literal("home"), v.literal("away")),
    sourceType: v.union(v.literal("user"), v.literal("otherClanUser")),
    userId: v.optional(v.id("users")),
    otherClanUserId: v.optional(v.id("otherClanUsers")),
    teamOrder: v.optional(v.number()),
    orderLocked: v.optional(v.boolean()),
  })
    .index("by_clanwar", ["clanwarId"]),

  clanwarMatches: defineTable({
    clanwarId: v.id("clanwars"),
    // user/otherClanUser 두 소스를 통일하기 위해 raw id가 아니라
    // clanwarParticipants row id를 참조한다.
    homeParticipantId: v.id("clanwarParticipants"),
    awayParticipantId: v.id("clanwarParticipants"),
    matchIndex: v.number(),
    status: v.optional(v.union(v.literal("pending"), v.literal("scored"), v.literal("done"))),
    // 데스매치 전용
    scoreHome: v.optional(v.number()),
    scoreAway: v.optional(v.number()),
    // 일반매치 전용 (점수 없이 결과만)
    result: v.optional(v.union(v.literal("home"), v.literal("away"), v.literal("draw"))),
    winnerParticipantId: v.optional(v.id("clanwarParticipants")),
    // 방송 링크(주로 유튜브) — 점수/결과 저장 시 함께 입력, 전체 경기 결과에서 아이콘으로 노출
    broadcastUrl: v.optional(v.string()),
  })
    .index("by_clanwar", ["clanwarId"])
    .index("by_clanwar_and_index", ["clanwarId", "matchIndex"]),

  // 게시판 종류 — 슈퍼관리자/관리자가 생성. writePermission으로 글쓰기 가능한 최소 등급을 정한다
  // ("user"면 내전관리자를 포함한 모든 로그인 사용자가 글쓰기 가능. 읽기는 항상 전체 로그인 사용자 공개)
  boards: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    writePermission: v.union(v.literal("superAdmin"), v.literal("admin"), v.literal("user")),
    // 익명 게시판: true면 작성자 닉네임을 다른 사용자에게 숨기고 "익명"으로 표시.
    // 관리자와 글쓴이 본인에게는 계속 실제 이름이 보인다 (모니터링/본인 확인용).
    isAnonymous: v.optional(v.boolean()),
    // 공지사항 게시판: true면 게시판 목록 맨 위에 고정 노출. 여러 개면 만든 순서대로 정렬.
    isNotice: v.optional(v.boolean()),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()),
  }),

  boardPosts: defineTable({
    boardId: v.id("boards"),
    authorId: v.id("users"),
    title: v.string(),
    content: v.string(),
    deletedAt: v.optional(v.number()),
  }).index("by_board", ["boardId"]),

  boardComments: defineTable({
    postId: v.id("boardPosts"),
    authorId: v.id("users"),
    content: v.string(),
    deletedAt: v.optional(v.number()),
  }).index("by_post", ["postId"]),
});
