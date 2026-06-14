# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

@AGENTS.md

## MCP 도구

**Context7** — 라이브러리 최신 문서를 코드 작성 중에 직접 조회할 수 있는 MCP 서버. 프롬프트에 `use context7`을 포함하면 Next.js, React, Convex, Clerk 등의 공식 문서를 실시간 참조합니다.

**Convex MCP** — 실행 중인 Convex 개발 서버에 직접 연결해 스키마 조회, 데이터 읽기/쓰기, 함수 실행 등을 Claude Code 내에서 수행할 수 있습니다. `npx convex dev` 실행 중일 때만 동작합니다.

두 MCP 모두 `.mcp.json`에 설정되어 있으며 Claude Code 재시작 후 자동 활성화됩니다.

## 명령어

```bash
npm run dev      # 개발 서버 시작 (Turbopack, .next/dev에 출력)
npm run build    # 프로덕션 빌드 (기본값: Turbopack)
npm run start    # 프로덕션 서버 시작
npm run lint     # ESLint 직접 실행 (v16에서 next lint 제거됨)
```

테스트 프레임워크는 설정되어 있지 않습니다.

## 아키텍처

**Next.js 16.2.9** App Router 프로젝트입니다. 주요 스택:

- **React 19.2.4** — View Transitions, `useEffectEvent`, Activity 포함
- **Tailwind CSS v4** — [app/globals.css](app/globals.css)에서 `@import "tailwindcss"`로 설정; 테마 토큰은 `@theme inline`으로 정의. PostCSS 플러그인은 `tailwindcss`가 아닌 `@tailwindcss/postcss`를 사용 (v4 변경사항)
- **Convex** — 백엔드 데이터베이스/서버리스 함수. `convex/` 폴더에 스키마·쿼리·뮤테이션·액션 정의. `NEXT_PUBLIC_CONVEX_URL` 환경변수 필요 (`npx convex dev` 최초 실행 시 `.env.local`에 자동 설정)
- **@clerk/nextjs ^7.5.0** — 설치되어 있으나 아직 연동되지 않음
- **TypeScript strict 모드**, 경로 별칭 `@/*`는 저장소 루트를 가리킴

진입점:
- [app/layout.tsx](app/layout.tsx) — 루트 레이아웃. `ConvexClientProvider`로 전체 앱 래핑, `next/font/google`로 Geist 폰트 로드
- [app/ConvexClientProvider.tsx](app/ConvexClientProvider.tsx) — `"use client"` 클라이언트 컴포넌트. `ConvexReactClient` 초기화 및 Provider 제공
- [convex/schema.ts](convex/schema.ts) — Convex 스키마 정의 (현재 빈 상태, 테이블 추가 시 여기에 작성)
- [app/page.tsx](app/page.tsx) — 홈 페이지 (기본값: 서버 컴포넌트)

## Convex 개발 시작

프로젝트를 처음 시작할 때 한 번만 실행:
```bash
npx convex dev   # 로그인 → 프로젝트 생성 → .env.local에 NEXT_PUBLIC_CONVEX_URL 자동 설정
```

이후 개발 시에는 터미널 두 개를 병렬 실행:
```bash
npx convex dev   # Convex 함수 변경사항 감지 및 배포 (convex/ 폴더 감시)
npm run dev      # Next.js 개발 서버
```

Convex 함수 작성 패턴:
- 쿼리: `convex/`에서 `query()` — 서버 컴포넌트나 `useQuery()` 훅으로 호출
- 뮤테이션: `mutation()` — Server Action이나 `useMutation()` 훅으로 호출
- `npx convex dev` 실행 중 파일 저장 시 `convex/_generated/` 자동 갱신됨

## Next.js 16 주요 변경 사항

학습 데이터와 다른 부분들이니 반드시 숙지할 것:

- **비동기 요청 API**: `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams`는 비동기 전용 — 동기 접근 불가. `await` 사용 또는 `npx next typegen`으로 타입 헬퍼(`PageProps`, `LayoutProps`, `RouteContext`) 자동 생성 가능.
- **`middleware.ts` → `proxy.ts`**: 미들웨어 파일명이 `proxy`로 변경; 내보내는 함수명도 반드시 `proxy`여야 함. `proxy`에서는 Edge 런타임 미지원.
- **`next lint` 제거**: ESLint CLI 직접 사용 (이미 `package.json`에 반영됨).
- **Turbopack 기본값**: `next dev`와 `next build` 모두 Turbopack 사용. 커스텀 webpack 설정이 있으면 `next build` 실패; `--webpack` 플래그로 우회 가능.
- **`revalidateTag` 두 번째 인자 필수**: `revalidateTag('tag', 'max')` — 인자 하나만 쓰면 TypeScript 오류. 즉시 캐시 만료는 `updateTag` 사용.
- **캐싱 API 안정화**: `cacheLife` / `cacheTag`를 `next/cache`에서 직접 import (더 이상 `unstable_` 접두사 불필요).
- **부분 사전 렌더링(PPR)**: `experimental.ppr` / `experimental_ppr` 라우트 설정 제거됨; `next.config.ts`에서 `cacheComponents: true`로 활성화.
- **병렬 라우트**: 모든 `@슬롯` 디렉토리에 `default.js` 명시 필수; 없으면 빌드 실패.
- **`serverRuntimeConfig` / `publicRuntimeConfig` 제거**: `process.env` / `NEXT_PUBLIC_` 환경변수 사용.
- **`next/image` 기본값 변경**: `minimumCacheTTL` → 4시간, `qualities` → `[75]`, `imageSizes`에서 `16` 제거, 쿼리스트링이 있는 로컬 이미지는 `images.localPatterns.search` 설정 필요.
- **React Compiler 안정화**: `next.config.ts`에서 `reactCompiler: true`로 활성화 (기본값: 비활성).

이 버전의 공식 API 레퍼런스는 `node_modules/next/dist/docs/`를 참고하세요.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
