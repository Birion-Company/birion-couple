/** Anel de progresso de uma meta (usado em Metas e no Início). */
export function GoalRing({ pct, done, late, size = 76 }: { pct: number; done: boolean; late: boolean; size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`goal-ring ${done ? "ok" : late ? "over" : ""}`} width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`${pct}% guardado`}>
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="track" />
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="bar" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" className="pct">
        {pct}%
      </text>
    </svg>
  );
}
