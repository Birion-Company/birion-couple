import { formatMoney } from "@/lib/money";

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

export function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: softColor(color, 0.22), width: size, height: size }} aria-hidden>
      {initials(name)}
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
