// 순위표 등에서 현재 시각이 사용자가 등록한 게임 가능 시간 범위에 해당할 때,
// 닉네임 위에 붉은 "IN GAME" 도장을 깜박이며 겹쳐 보여준다.
// 배경은 옅은 붉은 워시라 깜박이는 동안에도 닉네임 자체는 항상 그대로 읽힌다.
// 외부 CSS 파일(globals.css)의 @keyframes에 의존하면 번들링 순서에 따라 누락될 수 있어,
// 애니메이션 정의를 컴포넌트에 직접 인라인으로 포함해 항상 적용되도록 한다.
export function InGameStamp({ active, children }: { active?: boolean; children: React.ReactNode }) {
  if (!active) return <>{children}</>;

  return (
    <span className="relative inline-block">
      {children}
      <style>{`
        @keyframes in-game-stamp-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[55%] -rotate-[9deg] whitespace-nowrap rounded border-[1.5px] border-red-600 bg-red-500/15 px-1.5"
        style={{ animation: "in-game-stamp-blink 2.2s ease-in-out infinite" }}
        aria-hidden
      >
        <span className="bg-gradient-to-r from-red-700 to-red-300 bg-clip-text text-[0.6rem] font-extrabold tracking-wide text-transparent">
          IN GAME
        </span>
      </span>
    </span>
  );
}
