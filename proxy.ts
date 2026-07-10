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
    // public/ 폴더의 정적 파일(이미지 등)은 인증 미들웨어를 아예 거치지 않도록 확장자로 제외
    // — 그렇지 않으면 OG 이미지(bals-logo.png) 같은 파일도 auth.protect()에 막혀 404가 됨
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpe?g|gif|webp|svg|ico|avif|css|js|txt|xml|webmanifest)$).*)",
  ],
};
