import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// "/" 는 링크 공유 시 OG 이미지 미리보기(카카오톡/슬랙 등 크롤러)가 정상적으로
// HTTP 200을 받을 수 있도록 인증 보호에서 제외한다. 실제 이동은 클라이언트에서 처리.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export const proxy = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
