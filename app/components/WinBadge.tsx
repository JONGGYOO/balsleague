// 리그 종료 시 1위로 확정된 횟수(leagueWins)에 따라 닉네임 옆에 표시하는 배지.
// 1~4회: 별 1~4개 / 5~9회: 왕관 1개 + 별 0~4개 / 10회 이상: 화려한 왕관 1개(횟수 무관 고정)
export function WinBadge({ wins }: { wins?: number | null }) {
  const n = wins ?? 0;
  if (n <= 0) return null;

  if (n >= 10) {
    return (
      <span className="ml-1 inline-flex items-center align-middle" title={`리그 우승 ${n}회`}>
        <span
          className="text-sm drop-shadow-[0_0_3px_rgba(250,204,21,0.7)]"
          style={{
            background: "linear-gradient(135deg,#fde047,#f59e0b,#fde047)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          👑
        </span>
      </span>
    );
  }

  if (n >= 5) {
    const stars = n - 5;
    return (
      <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-sm" title={`리그 우승 ${n}회`}>
        <span>👑</span>
        {stars > 0 && <span className="text-amber-400">{"★".repeat(stars)}</span>}
      </span>
    );
  }

  return (
    <span className="ml-1 align-middle text-sm text-amber-400" title={`리그 우승 ${n}회`}>
      {"★".repeat(n)}
    </span>
  );
}
