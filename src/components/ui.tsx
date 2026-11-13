import { createElement } from "react";
import { iconFor } from "@/lib/category-icons";
import { formatMoney } from "@/lib/money";
import { cardMark } from "@/lib/card-brands";

export function Money({
  cents,
  currency = "BRL",
  signed = false,
  className = "",
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  className?: string;
}) {
  const tone = signed ? (cents > 0 ? "pos" : cents < 0 ? "neg" : "") : "";
  const text = formatMoney(signed ? Math.abs(cents) : cents, currency);
  return <span className={`num ${tone} ${className}`}>{signed && cents > 0 ? "+" : signed && cents < 0 ? "−" : ""}{text}</span>;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Cor suave de fundo a partir da cor da pessoa. */
export function softColor(hex: string, alpha = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function Avatar({ name, color, size = 34, src }: { name: string; color: string; size?: number; src?: string | null }) {
  return (
    <span
      className="avatar"
      style={{ background: softColor(color, 0.22), width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="avatar-img" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", opts).replace(".", "");
}

/** Ícone da categoria num quadradinho com a cor dela; sem categoria, um ícone neutro. */
/** Bolinha do cartão (cor e sigla da marca), para marcar de qual cartão é um lançamento. */
export function CardDot({ name, color, size = 16 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="card-dot"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.5), color: cardDotInk(color) }}
      title={`Cartão ${name}`}
      role="img"
      aria-label={`Cartão ${name}`}
    >
      {cardMark(name)}
    </span>
  );
}

/** Texto claro ou escuro, conforme a cor de fundo da bolinha. */
function cardDotInk(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#1a1a1a" : "#fff";
}

export function CategoryIcon({ icon, color, size = 30, title, card }: { icon?: string | null; color?: string | null; size?: number; title?: string; card?: { name: string; color: string } | null }) {
  const c = color ?? "#94A3B8";
  return (
    <span
      className="cat-icon"
      style={{ width: size, height: size, color: c, background: softColor(c, 0.16), borderColor: softColor(c, 0.35) }}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {createElement(iconFor(icon), { size: Math.round(size * 0.55), strokeWidth: 1.9 })}
      {card && <CardDot name={card.name} color={card.color} size={Math.max(16, Math.round(size * 0.55))} />}
    </span>
  );
}
