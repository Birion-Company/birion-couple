/** Valores iniciais de uma família nova. Tudo pode ser mudado depois em Ajustes. */

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
  { value: "pending", label: "Pendente", help: "Ainda não foi pago. Aparece em Pendências e não entra nos saldos." },
  { value: "open", label: "Pago, a acertar", help: "Alguém pagou e os outros ainda devem a sua parte. Entra nos saldos." },
  { value: "settled", label: "Acertado", help: "Já foi reembolsado ou acertado. Não entra nos saldos." },
] as const;

export const KINDS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Acerto entre pessoas" },
] as const;

export const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
];
