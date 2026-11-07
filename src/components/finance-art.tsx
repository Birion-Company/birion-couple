/** Ilustração de crescimento financeiro: moedas, barras em 3D e seta subindo, nas cores da Biriun. */
export function FinanceArt({ className }: { className?: string }) {
  const bars = [
    { x: 250, h: 100 },
    { x: 306, h: 140 },
    { x: 362, h: 175 },
    { x: 418, h: 215 },
  ];
  const base = 300;
  const w = 44;
  const d = 10; // profundidade do 3D
  const stacks = [
    { x: 70, n: 4 },
    { x: 140, n: 7 },
    { x: 210, n: 10 },
  ];
  return (
    <svg className={className} viewBox="0 0 520 330" role="img" aria-label="Ilustração: moedas e barras subindo com uma seta de crescimento">
      <defs>
        <linearGradient id="fa-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1AC4DB" stopOpacity="0.95" />
          <stop offset="1" stopColor="#0C6F80" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="fa-bar-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0C8FA3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0A4F5C" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="fa-arrow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1AC4DB" stopOpacity="0" />
          <stop offset="0.45" stopColor="#1AC4DB" stopOpacity="0.85" />
          <stop offset="1" stopColor="#0C8FA3" />
        </linearGradient>
        <linearGradient id="fa-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD873" />
          <stop offset="1" stopColor="#E0A526" />
        </linearGradient>
        <linearGradient id="fa-gold-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B7791F" />
          <stop offset="0.5" stopColor="#F2BE45" />
          <stop offset="1" stopColor="#B7791F" />
        </linearGradient>
        <radialGradient id="fa-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#1AC4DB" stopOpacity="0.35" />
          <stop offset="1" stopColor="#1AC4DB" stopOpacity="0" />
        </radialGradient>
        <filter id="fa-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* brilho no chão */}
      <ellipse cx="300" cy="306" rx="250" ry="22" fill="url(#fa-floor)" />

      {/* barras */}
      {bars.map(({ x, h }) => (
        <g key={x}>
          <path d={`M${x + w} ${base - h} l${d} ${-d} v${h} l${-d} ${d} Z`} fill="url(#fa-bar-side)" />
          <path d={`M${x} ${base - h} l${d} ${-d} h${w} l${-d} ${d} Z`} fill="#7FE6F2" fillOpacity="0.85" />
          <rect x={x} y={base - h} width={w} height={h} fill="url(#fa-bar)" />
          <rect x={x} y={base - h} width={w} height={h} fill="none" stroke="#0C8FA3" strokeOpacity="0.25" />
        </g>
      ))}

      {/* seta */}
      <path d="M20 296 C 160 290, 300 230, 455 50" fill="none" stroke="#1AC4DB" strokeWidth="16" strokeLinecap="round" opacity="0.3" filter="url(#fa-glow)" />
      <path d="M20 296 C 160 290, 300 230, 455 50" fill="none" stroke="url(#fa-arrow)" strokeWidth="12" strokeLinecap="round" />
      <path d="M478 22 L486 84 L462 66 L438 74 Z" fill="#0C8FA3" />

      {/* pilhas de moedas */}
      {stacks.map(({ x, n }) => (
        <g key={x}>
          {Array.from({ length: n }, (_, i) => {
            const y = 300 - i * 9;
            return (
              <g key={i}>
                <path d={`M${x - 30} ${y - 6} v8 a30 9 0 0 0 60 0 v-8`} fill="url(#fa-gold-edge)" />
                <ellipse cx={x} cy={y - 6} rx="30" ry="9" fill="url(#fa-gold)" />
              </g>
            );
          })}
          <ellipse cx={x} cy={300 - (n - 1) * 9 - 6} rx="19" ry="5" fill="none" stroke="#B7791F" strokeOpacity="0.55" strokeWidth="1.5" />
        </g>
      ))}

      {/* moeda em pé */}
      <g transform="translate(262 262)">
        <ellipse cx="4" cy="2" rx="34" ry="36" fill="#B7791F" />
        <ellipse cx="0" cy="0" rx="34" ry="36" fill="url(#fa-gold)" />
        <ellipse cx="0" cy="0" rx="26" ry="28" fill="none" stroke="#B7791F" strokeOpacity="0.6" strokeWidth="2" />
        <text x="0" y="9" textAnchor="middle" fontSize="24" fontWeight="700" fill="#9A6412" fontFamily="Inter, system-ui, sans-serif">
          R$
        </text>
      </g>
    </svg>
  );
}
