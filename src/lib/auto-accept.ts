/** Regras de aceite automático (parte pura, sem banco). */
export type AutoRule = { id: string; participantId: string; fromParticipantId: string; maxCents: number | null; match: string | null };
export type AutoTx = { creatorId: string | null; description: string; amountCents: number; splits: { participantId: string; amountCents: number }[] };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A regra vale para este lançamento, do ponto de vista de quem aceita? (maiúsculas e acentos não contam) */
export function ruleApplies(rule: AutoRule, tx: AutoTx): boolean {
  if (!tx.creatorId || tx.creatorId !== rule.fromParticipantId) return false;
  if (rule.match && rule.match.trim() && !fold(tx.description).includes(fold(rule.match.trim()))) return false;
  if (rule.maxCents !== null) {
    // O limite é sobre a parte de quem aceita; se ela só pagou, vale o total.
    const share = tx.splits.find((s) => s.participantId === rule.participantId)?.amountCents ?? tx.amountCents;
    if (share > rule.maxCents) return false;
  }
  return true;
}

export function describeRule(rule: AutoRule, names: (id: string) => string, money: (c: number) => string): string {
  const parts = [`Aceitar o que ${names(rule.fromParticipantId)} lançar`];
  if (rule.maxCents !== null) parts.push(`até ${money(rule.maxCents)} na sua parte`);
  if (rule.match) parts.push(`com "${rule.match}" na descrição`);
  return parts.join(", ");
}
