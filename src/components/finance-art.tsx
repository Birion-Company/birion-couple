/** Ilustração de finanças nas cores da Biriun: cartão, gráfico em alta, moedas e divisão entre pessoas. */
export function FinanceArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 420 300" role="img" aria-label="Ilustração: gráfico de crescimento, cartão e moedas">
      <defs>
        <linearGradient id="fa-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1AC4DB" />
          <stop offset="1" stopColor="#0C8FA3" />
        </linearGradient>
        <linearGradient id="fa-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1AC4DB" stopOpacity="0.35" />
          <stop offset="1" stopColor="#1AC4DB" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* painel do gráfico */}
      <rect x="24" y="18" width="250" height="170" rx="18" fill="#ffffff" fillOpacity="0.06" stroke="#ffffff" strokeOpacity="0.12" />
      {[60, 95, 130, 165].map((y) => (
        <line key={y} x1="44" x2="254" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.07" />
      ))}
      {[
        [56, 120, 45],
        [92, 104, 61],
        [128, 112, 53],
        [164, 84, 81],
        [200, 70, 95],
        [236, 50, 115],
      ].map(([x, y, h]) => (
        <rect key={x} x={x - 9} y={y} width="18" height={h} rx="5" fill="#DDFCFF" fillOpacity="0.16" />
      ))}
      <path d="M50 140 L92 118 L128 126 L164 96 L200 82 L240 52 L240 165 L50 165 Z" fill="url(#fa-area)" />
      <path d="M50 140 L92 118 L128 126 L164 96 L200 82 L240 52" fill="none" stroke="#1AC4DB" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="240" cy="52" r="6" fill="#1AC4DB" stroke="#0F1D38" strokeWidth="3" />
      <rect x="44" y="30" width="64" height="8" rx="4" fill="#ffffff" fillOpacity="0.35" />

      {/* cartão */}
      <g transform="translate(196 132) rotate(-8)">
        <rect width="190" height="118" rx="16" fill="url(#fa-card)" />
        <rect x="18" y="22" width="30" height="22" rx="5" fill="#DDFCFF" fillOpacity="0.85" />
        <rect x="18" y="72" width="110" height="8" rx="4" fill="#0F1D38" fillOpacity="0.35" />
        <rect x="18" y="88" width="64" height="8" rx="4" fill="#0F1D38" fillOpacity="0.25" />
        <circle cx="150" cy="88" r="13" fill="#DDFCFF" fillOpacity="0.55" />
        <circle cx="166" cy="88" r="13" fill="#DDFCFF" fillOpacity="0.3" />
      </g>

      {/* moedas */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(70 ${262 - i * 12})`}>
          <ellipse cx="0" cy="6" rx="34" ry="11" fill="#0C8FA3" />
          <ellipse cx="0" cy="0" rx="34" ry="11" fill="#1AC4DB" />
          <ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="#DDFCFF" strokeOpacity="0.6" strokeWidth="2" />
        </g>
      ))}
      <g transform="translate(130 262)">
        <ellipse cx="0" cy="6" rx="26" ry="9" fill="#0C8FA3" />
        <ellipse cx="0" cy="0" rx="26" ry="9" fill="#1AC4DB" />
      </g>

      {/* pessoas dividindo */}
      {[
        [318, 34, "#DDFCFF"],
        [352, 52, "#1AC4DB"],
        [318, 72, "#A7EEF7"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r="15" fill={c as string} fillOpacity="0.9" />
          <circle cx={x as number} cy={(y as number) - 3} r="5" fill="#0F1D38" fillOpacity="0.55" />
          <path d={`M${(x as number) - 8} ${(y as number) + 9} a8 6 0 0 1 16 0`} fill="#0F1D38" fillOpacity="0.55" />
        </g>
      ))}
      <path d="M333 34 L337 46 M333 72 L337 60" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
