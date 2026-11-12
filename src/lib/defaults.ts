/** Valores iniciais de uma família nova. Tudo pode ser mudado depois em Ajustes. */

/** Máximo de cartões ativos por pessoa (arquivados não contam). */
export const CARDS_PER_PERSON_MAX = 3;

/**
 * Pessoas de uma família:
 * - Membros: têm login (entram no app). Limite do plano família, contando você.
 * - Contatos: sem login (quem só divide conta, como Fulano). Limite de ativos (os que aparecem nas listas)
 *   e um teto do total guardado, para as listas e os cálculos de dívida não crescerem sem fim.
 */
export const MEMBERS_MAX = 10;
/** Por pessoa com login: cada uma tem os próprios contatos. */
export const CONTACTS_ACTIVE_MAX = 80;
export const CONTACTS_TOTAL_MAX = 200;
/** Contato sem dívida e sem lançamento há esse tempo sai das listas sozinho (volta ao digitar o nome). */
export const CONTACT_IDLE_DAYS = 90;
export const MEMBERS_FULL_MESSAGE = `A família já tem ${MEMBERS_MAX} pessoas com login, o máximo do plano.`;
export const CONTACTS_FULL_MESSAGE = `Já há ${CONTACTS_ACTIVE_MAX} contatos ativos. Esconda um que não usa mais, em Ajustes → Pessoas.`;
export const CONTACTS_TOTAL_MESSAGE = `Você chegou a ${CONTACTS_TOTAL_MAX} contatos guardados. Exclua alguns que não usa mais.`;

/** Tamanho máximo do nome da família (aparece no menu lateral, abaixo da marca). */
export const HOUSEHOLD_NAME_MAX = 20;

/** "Família de Fulano", cortado para caber no limite quando o primeiro nome é muito longo. */
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
  { name: "Mercado", icon: "cart", color: "#3BAA7F" },
  { name: "Moradia", icon: "home", color: "#5B7FDB" },
  { name: "Transporte", icon: "car", color: "#E0A526" },
  { name: "Saúde", icon: "health", color: "#E26D5C" },
  { name: "Lazer", icon: "party", color: "#A77BDB" },
  { name: "Educação", icon: "education", color: "#1AC4DB" },
  { name: "Assinaturas", icon: "tv", color: "#D46BA3" },
  { name: "Outros", icon: "tag", color: "#94A3B8" },
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
    help: "Ainda falta resolver (pagar a conta ou acertar com alguém). Aparece em Pendentes no painel. Se alguém já pagou e dividiu, os outros já aparecem devendo em Dívidas.",
  },
  {
    value: "open",
    label: "Pago, a acertar",
    help: "Alguém já pagou e os outros ainda vão acertar a parte deles. Conta em Dívidas, mas sai de Pendentes.",
  },
  {
    value: "settled",
    label: "Acertado",
    help: "Já foi reembolsado ou acertado. Sai de Dívidas e de Pendentes.",
  },
] as const;

export const KINDS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "loan", label: "Dívida" },
  { value: "transfer", label: "Acerto entre pessoas" },
] as const;

export const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
];
