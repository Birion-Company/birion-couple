/** Valores iniciais de uma família nova. Tudo pode ser mudado depois em Ajustes. */

/** Máximo de pessoas ativas numa família (arquivadas não contam). */
export const FAMILY_PEOPLE_MAX = 10;
export const FAMILY_FULL_MESSAGE = `A família já tem ${FAMILY_PEOPLE_MAX} pessoas, o máximo. Arquive alguém para abrir espaço.`;

/** Tamanho máximo do nome da família (aparece no menu lateral, abaixo da marca). */
export const HOUSEHOLD_NAME_MAX = 20;

/** "Família de Felipe", cortado para caber no limite quando o primeiro nome é muito longo. */
export function defaultHouseholdName(fullName: string) {
  const first = fullName.trim().split(/\s+/)[0] || "";
  return `Família de ${first}`.slice(0, HOUSEHOLD_NAME_MAX).trim();
}

export const DEFAULT_STATUSES = [
  { name: "Pendente", color: "#E0A526", behavior: "pending", isDefault: true, isImportDefault: true },
  { name: "Pago por mim", color: "#1AC4DB", behavior: "open", isDefault: false, isImportDefault: false },
  { name: "Reembolsado", color: "#3BAA7F", behavior: "settled", isDefault: false, isImportDefault: false },
] as const;

export const DEFAULT_CATEGORIES = [
  { name: "Mercado", color: "#3BAA7F" },
  { name: "Moradia", color: "#5B7FDB" },
  { name: "Transporte", color: "#E0A526" },
  { name: "Saúde", color: "#E26D5C" },
  { name: "Lazer", color: "#A77BDB" },
  { name: "Educação", color: "#1AC4DB" },
  { name: "Assinaturas", color: "#D46BA3" },
  { name: "Outros", color: "#94A3B8" },
];

/** Paleta suave usada nos seletores de cor e para novas pessoas. */
export const PALETTE = [
  "#1AC4DB",
  "#5B7FDB",
  "#3BAA7F",
  "#E0A526",
  "#E26D5C",
  "#A77BDB",
  "#D46BA3",
  "#64748B",
];

export const STATUS_BEHAVIORS = [
  {
    value: "pending",
    label: "Pendente",
    help: "Ainda falta resolver (pagar a conta ou acertar com alguém). Aparece em Pendências no painel. Se alguém já pagou e dividiu, os outros já aparecem devendo em Dívidas.",
  },
  {
    value: "open",
    label: "Pago, a acertar",
    help: "Alguém já pagou e os outros ainda vão acertar a parte deles. Conta em Dívidas, mas sai da lista de Pendências.",
  },
  {
    value: "settled",
    label: "Acertado",
    help: "Já foi reembolsado ou acertado. Sai de Dívidas e de Pendências.",
  },
] as const;

export const KINDS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "loan", label: "Empréstimo" },
  { value: "transfer", label: "Acerto entre pessoas" },
] as const;

export const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
];
