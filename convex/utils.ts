import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const SUPER_ADMIN_EMAIL = "cotmul82@gmail.com";

type ReadCtx = Pick<QueryCtx, "auth" | "db">;

export async function getEffectiveRole(
  ctx: ReadCtx
): Promise<"superAdmin" | "admin" | "user"> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return "user";

  if ((identity.email ?? "") === SUPER_ADMIN_EMAIL) return "superAdmin";

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  // Clerk JWT에 email 클레임이 없는 경우 DB에 저장된 이메일로 판별 (1-1 버그 대응)
  if ((user?.email ?? "") === SUPER_ADMIN_EMAIL) return "superAdmin";

  return user?.role === "admin" ? "admin" : "user";
}

// 인증된 사용자의 DB 레코드를 가져오거나, 없으면 자동 생성합니다.
// upsertUser가 아직 실행되지 않은 사용자도 안전하게 처리합니다.
export async function getOrCreateUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (existing) return existing;

  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name ?? undefined,
    email: identity.email ?? undefined,
  });

  const created = await ctx.db.get(userId);
  if (!created) throw new Error("사용자 생성에 실패했습니다.");
  return created;
}
