/** Tipos de notificação que a pessoa pode ligar ou desligar (todos começam ligados). */
export const PUSH_KINDS = [
  { key: "fatura-fecha", label: "Fatura perto de fechar", hint: "Na antecedência escolhida em cada cartão" },
  { key: "fatura-vence", label: "Fatura perto de vencer", hint: "Para não esquecer de pagar" },
  { key: "divida", label: "Dívida nova", hint: "Lançaram algo que te deixa devendo" },
  { key: "pagamento", label: "Pagamentos", hint: "Alguém registrou que pagou (ou que você recebeu)" },
  { key: "te-devem", label: "Lançamentos que te devem", hint: "Lançaram algo que você pagou e outros devem" },
  { key: "alteracao", label: "Alterações e exclusões", hint: "Mudaram ou apagaram algo com você" },
  { key: "importacao", label: "Importações e lançamentos em lote", hint: "Extrato importado ou vários de uma vez" },
] as const;

export type PushKind = (typeof PUSH_KINDS)[number]["key"];
export type PushPrefs = Partial<Record<PushKind, boolean>>;

export const wants = (prefs: unknown, kind: PushKind) => (prefs as PushPrefs | null)?.[kind] !== false;
