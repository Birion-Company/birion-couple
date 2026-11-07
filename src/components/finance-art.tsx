/**
 * Cena de crescimento financeiro que forma o rodapé do painel de entrada:
 * faixa de seta saindo da borda, barras em 3D e pilhas de moedas sobre um "chão".
 * As cores vêm de variáveis CSS (--art-*), então acompanham o tema claro/escuro.
 */
const v = (name: string) => ({ stopColor: `var(${name})` });

function CoinStack({ x, n, base }: { x: number; n: number; base: number }) {
  const h = 13; // espessura de cada moeda
  const rx = 40;
  const ry = 12;
  return (
    <g>
      <ellipse cx={x + 6} cy={base + 4} rx={rx + 14} ry={ry + 2} fill="#000" opacity="0.18" />
      {Array.from({ length: n }, (_, i) => {
        const y = base - i * h;
        const edge = `M${x - rx} ${y - h} v${h} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-h} Z`;
        return (
          <g key={i}>
            <path d={edge} fill="url(#fa-gold-edge)" />
            <path d={edge} fill="url(#fa-ridges)" />
            <ellipse cx={x} cy={y - h} rx={rx} ry={ry} fill="url(#fa-gold-top)" />
          </g>
        );
      })}
      <ellipse cx={x} cy={base - n * h} rx={rx - 9} ry={ry - 3.5} fill="none" stroke="#B7791F" strokeOpacity="0.5" strokeWidth="1.6" />
      <ellipse cx={x - 12} cy={base - n * h - 3} rx="12" ry="3" fill="#FFF4CC" opacity="0.55" />
    </g>
  );
}

export function FinanceArt({ className }: { className?: string }) {
  const floor = 336;
  const bars = [
    { x: 452, h: 120 },
    { x: 530, h: 168 },
    { x: 608, h: 214 },
    { x: 686, h: 262 },
  ];
  const w = 58;
  const d = 12;
  return (
    <svg
      className={className}
      viewBox="150 -50 660 410"
      preserveAspectRatio="xMaxYMax meet"
      role="img"
      aria-label="Ilustração: pilhas de moedas e barras subindo com uma seta de crescimento"
    >
      <defs>
        <linearGradient id="fa-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={v("--art-bar-a")} />
          <stop offset="1" style={v("--art-bar-b")} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="fa-bar-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fa-arrow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={v("--art-arrow")} stopOpacity="0" />
          <stop offset="0.35" style={v("--art-arrow")} stopOpacity="0.35" />
          <stop offset="1" style={v("--art-arrow")} />
        </linearGradient>
        <linearGradient id="fa-gold-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE8A3" />
          <stop offset="0.55" stopColor="#F6C445" />
          <stop offset="1" stopColor="#D99A1E" />
        </linearGradient>
        <linearGradient id="fa-gold-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A86A10" />
          <stop offset="0.35" stopColor="#F2BE45" />
          <stop offset="0.6" stopColor="#FFD873" />
          <stop offset="1" stopColor="#A86A10" />
        </linearGradient>
        <pattern id="fa-ridges" width="5" height="20" patternUnits="userSpaceOnUse">
          <rect width="1.6" height="20" fill="#7A4A08" opacity="0.28" />
        </pattern>
        <radialGradient id="fa-floor" cx="0.62" cy="0.5" r="0.5">
          <stop offset="0" style={v("--art-floor")} />
          <stop offset="1" style={v("--art-floor")} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fa-coin-face" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFF0B8" />
          <stop offset="0.5" stopColor="#F6C445" />
          <stop offset="1" stopColor="#C98612" />
        </radialGradient>
        <filter id="fa-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* ondas de fundo que ligam a cena ao painel */}
      <path d="M0 250 C 200 200, 420 230, 800 90 L800 360 L0 360 Z" style={{ fill: "var(--art-wave)" }} />
      <path d="M0 300 C 240 270, 480 290, 800 190 L800 360 L0 360 Z" style={{ fill: "var(--art-wave)" }} />

      {/* chão */}
      <ellipse cx="500" cy={floor + 4} rx="380" ry="34" fill="url(#fa-floor)" />

      {/* barras */}
      {bars.map(({ x, h }) => {
        const top = floor - h;
        return (
          <g key={x}>
            <path d={`M${x + w} ${top + 6} l${d} ${-d} v${h - 6} l${-d} ${d} Z`} style={{ fill: "var(--art-bar-side)" }} opacity="0.9" />
            <path d={`M${x + 6} ${top} l${d} ${-d} h${w - 12} q6 0 6 6 l${-d} ${d} Z`} style={{ fill: "var(--art-bar-top)" }} />
            <path d={`M${x} ${floor} V${top + 6} q0 -6 6 -6 h${w - 12} q6 0 6 6 V${floor} Z`} fill="url(#fa-bar)" />
            <path d={`M${x} ${floor} V${top + 6} q0 -6 6 -6 h${w - 12} q6 0 6 6 V${floor} Z`} fill="url(#fa-bar-shine)" />
          </g>
        );
      })}

      {/* faixa da seta, saindo de trás das moedas */}
      <path d="M160 330 C 300 322, 420 296, 540 214 C 620 160, 684 108, 722 66 L700 52 L782 18 L770 104 L748 86 C 700 140, 636 196, 548 250 C 440 318, 310 340, 160 342 Z" style={{ fill: "var(--art-arrow-glow)" }} filter="url(#fa-glow)" />
      <path d="M160 330 C 300 322, 420 296, 540 214 C 620 160, 684 108, 722 66 L700 52 L782 18 L770 104 L748 86 C 700 140, 636 196, 548 250 C 440 318, 310 340, 160 342 Z" fill="url(#fa-arrow)" />

      {/* moedas na frente */}
      <CoinStack x={238} n={3} base={floor} />
      <CoinStack x={330} n={6} base={floor} />
      <CoinStack x={422} n={9} base={floor} />

      {/* moeda em pé */}
      <g transform={`translate(488 ${floor - 44}) rotate(-10)`}>
        <ellipse cx="6" cy="46" rx="44" ry="7" fill="#000" opacity="0.2" />
        <ellipse cx="7" cy="0" rx="42" ry="44" fill="#A86A10" />
        <ellipse cx="0" cy="0" rx="42" ry="44" fill="url(#fa-coin-face)" />
        <ellipse cx="0" cy="0" rx="33" ry="35" fill="none" stroke="#B7791F" strokeOpacity="0.55" strokeWidth="2.5" />
        <text x="0" y="13" textAnchor="middle" fontSize="38" fontWeight="800" fill="#A86A10" fontFamily="Inter, system-ui, sans-serif">
          $
        </text>
      </g>
    </svg>
  );
}
