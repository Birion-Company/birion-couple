/**
 * Cartões prontos para escolher (os principais do Brasil). O nome do cartão vem desta lista: não se digita nome,
 * e a cor é a da marca. "mark" é a sigla que vai na bolinha do cartão em cima do lançamento.
 */
export type CardBrand = { name: string; color: string; mark: string };

export const CARD_BRANDS: CardBrand[] = [
  { name: "Nubank", color: "#8A05BE", mark: "Nu" },
  { name: "Itaú", color: "#EC7000", mark: "It" },
  { name: "Bradesco", color: "#CC092F", mark: "Br" },
  { name: "Santander", color: "#EC0000", mark: "Sa" },
  { name: "Banco do Brasil", color: "#F7C600", mark: "BB" },
  { name: "Caixa", color: "#0070AF", mark: "Cx" },
  { name: "Inter", color: "#FF7A00", mark: "In" },
  { name: "C6 Bank", color: "#242424", mark: "C6" },
  { name: "BTG Pactual", color: "#0B2B4C", mark: "BT" },
  { name: "XP", color: "#1C1C1C", mark: "XP" },
  { name: "PicPay", color: "#21C25E", mark: "Pp" },
  { name: "Mercado Livre", color: "#FFE600", mark: "ML" },
  { name: "Mercado Pago", color: "#00B1EA", mark: "MP" },
  { name: "Neon", color: "#00E5E5", mark: "Ne" },
  { name: "Next", color: "#00FF5F", mark: "Nx" },
  { name: "Original", color: "#1BA24D", mark: "Or" },
  { name: "Will Bank", color: "#FFD60A", mark: "Wi" },
  { name: "Sicredi", color: "#3FA535", mark: "Sc" },
  { name: "Sicoob", color: "#003641", mark: "So" },
  { name: "Banrisul", color: "#0056A6", mark: "Bz" },
  { name: "Safra", color: "#0A2342", mark: "Sf" },
  { name: "Porto Bank", color: "#00A3E0", mark: "Po" },
  { name: "Renner", color: "#E2001A", mark: "Rn" },
  { name: "Magalu", color: "#0086FF", mark: "Mg" },
  { name: "Amazon", color: "#FF9900", mark: "Am" },
  { name: "American Express", color: "#006FCF", mark: "Ax" },
  { name: "Outro cartão", color: "#64748B", mark: "••" },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** A marca de um cartão pelo nome (sem diferenciar acento ou maiúsculas); nulo para nomes antigos digitados à mão. */
export function brandOf(name: string): CardBrand | null {
  const n = fold(name);
  return CARD_BRANDS.find((b) => fold(b.name) === n) ?? null;
}

/** Sigla da bolinha: a da marca ou as duas primeiras letras do nome. */
export function cardMark(name: string): string {
  return brandOf(name)?.mark ?? (name.trim().slice(0, 2) || "•");
}
