import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addMonthsIso, daysBetween } from "./cards";
import { merchantKey, parseInstallment } from "./import/patterns";
import { insertReturning, updateReturning } from "@/db/ops";

const t = schema.transactions;
type Conn = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Origem das parcelas criadas sozinhas (a importação seguinte troca pela de verdade). */
export const PREDICTED = "previsto";

/**
 * Compras parceladas vindas do extrato: a importação já tira "Parcela 3/10" da descrição e guarda
 * o número na série (seriesIndex/seriesTotal). Aqui são criadas as parcelas que faltam (4/10 a 10/10),
 * uma por mês, com a mesma descrição, divisão, cartão e categoria, todas na mesma série.
 * Lançamentos antigos com "Parcela 3/10" na descrição também entram (a descrição fica limpa).
 * Se uma parcela futura já existe (veio de outra importação), só entra na série.
 * Seguro chamar várias vezes: só olha parcelas que ainda não estão numa série.
 */
export async function expandInstallments(householdId: string): Promise<number> {
  const db = getDb();
  await cleanInstallmentDescriptions(householdId);
  const pending = and(
    eq(t.householdId, householdId),
    isNull(t.seriesId),
    eq(t.kind, "expense"),
    or(and(eq(t.seriesKind, "installment"), isNotNull(t.seriesTotal)), sql`${t.description} regexp '(parcela|parc)'`),
  );
  const candidates = await db.select({ id: t.id }).from(t).where(pending).limit(500);
  if (candidates.length === 0) return 0;
  return db.transaction(async (tx) => {
    // Uma família por vez (duas abas abertas não criam parcelas em dobro).
    // (GET_LOCK vale para a conexão; é solto no fim da transação, abaixo.)
    await tx.execute(sql`select get_lock(${"installments:" + householdId}, 30)`);
    const rows = await tx
      .select()
      .from(t)
      .where(and(pending, inArray(t.id, candidates.map((c) => c.id))))
      .orderBy(t.date);
    let created = 0;
    try {
    for (const r of rows) {
      // Já veio da importação com o número da parcela, ou ainda está na descrição (lançamento antigo).
      const fromText = parseInstallment(r.description);
      const inst =
        r.seriesKind === "installment" && r.seriesIndex && r.seriesTotal
          ? { base: fromText?.base ?? r.description, index: r.seriesIndex, total: r.seriesTotal }
          : fromText;
      if (!inst) continue;
      // Pode ter entrado numa série no meio do caminho (como parcela futura de outra).
      const [still] = await tx.select({ seriesId: t.seriesId }).from(t).where(eq(t.id, r.id));
      if (still?.seriesId) continue;
      const seriesId = randomUUID();
      const series = { seriesId, seriesKind: "installment", seriesTotal: inst.total };
      await tx.update(t).set({ ...series, seriesIndex: inst.index, description: inst.base }).where(eq(t.id, r.id));
      const splits = await tx
        .select({ participantId: schema.transactionSplits.participantId, amountCents: schema.transactionSplits.amountCents })
        .from(schema.transactionSplits)
        .where(eq(schema.transactionSplits.transactionId, r.id));
      for (let k = inst.index + 1; k <= inst.total; k++) {
        const date = addMonthsIso(r.date, k - inst.index);
        // Parcela que já veio de outra importação: só entra na série.
        const others = await tx
          .select({ id: t.id, date: t.date, description: t.description, seriesIndex: t.seriesIndex, seriesTotal: t.seriesTotal })
          .from(t)
          .where(and(eq(t.householdId, householdId), isNull(t.seriesId), eq(t.kind, "expense"), sql`lower(${t.description}) like lower(${inst.base + "%"})`));
        const same = others.find((o) => {
          const p = parseInstallment(o.description);
          const idx = p?.index ?? o.seriesIndex;
          const tot = p?.total ?? o.seriesTotal;
          const base = p?.base ?? o.description;
          return base.toLowerCase() === inst.base.toLowerCase() && idx === k && tot === inst.total && Math.abs(daysBetween(o.date, date)) <= 25;
        });
        if (same) {
          await tx.update(t).set({ ...series, seriesIndex: k, description: inst.base }).where(eq(t.id, same.id));
          continue;
        }
        const [row] = await insertReturning(tx, t, {
            householdId,
            date,
            description: inst.base,
            amountCents: r.amountCents,
            kind: r.kind,
            payerId: r.payerId,
            categoryId: r.categoryId,
            projectId: r.projectId,
            cardId: r.cardId,
            notes: r.notes,
            source: PREDICTED,
            createdBy: r.createdBy,
            ...series,
            seriesIndex: k,
          }, { id: t.id });
        if (splits.length) await tx.insert(schema.transactionSplits).values(splits.map((x) => ({ ...x, transactionId: row.id })));
        created++;
      }
    }
    } finally {
      await tx.execute(sql`select release_lock(${"installments:" + householdId})`);
    }
    return created;
  });
}

/**
 * Parcelas que já estão numa série mas ainda têm "- Parcela 2/3" na descrição (criadas antes de a
 * importação limpar o texto): a descrição fica só "Loja", e o número aparece no selo ao lado.
 */
async function cleanInstallmentDescriptions(householdId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: t.id, description: t.description })
    .from(t)
    .where(and(eq(t.householdId, householdId), eq(t.seriesKind, "installment"), isNotNull(t.seriesId), sql`${t.description} regexp '(parcela|parc)'`))
    .limit(1000);
  for (const r of rows) {
    const base = parseInstallment(r.description)?.base;
    if (base) await db.update(t).set({ description: base }).where(eq(t.id, r.id));
  }
}

export type Learned = {
  categoryId: string | null;
  participantIds: string[];
  /**
   * O histórico deste lugar é sempre igual (mesma divisão nas últimas vezes)? Se não (ex.: uber quase sempre é seu,
   * mas às vezes é de outra pessoa), a importação não decide sozinha: marca para conferir em A identificar.
   */
  consistent: boolean;
  /** Quantas vezes já apareceu. */
  seen: number;
};

/** Quantas ocorrências recentes valem para dizer que o histórico é sempre igual. */
export const REUSE_WINDOW = 4;

/**
 * O que a família já fez com cada estabelecimento: a categoria e de quem é a conta da vez mais recente.
 * Usado para classificar sozinho as próximas compras no mesmo lugar ("Panificadora" → Mercado, sua).
 */
export async function learnedByMerchant(householdId: string, conn: Conn | ReturnType<typeof getDb> = getDb()): Promise<Map<string, Learned>> {
  const rows = await conn
    .select({
      description: t.description,
      categoryId: t.categoryId,
      participantIdsCsv: sql<string | null>`group_concat(case when ${schema.transactionSplits.amountCents} > 0 then ${schema.transactionSplits.participantId} end separator ',')`,
    })
    .from(t)
    .leftJoin(schema.transactionSplits, eq(schema.transactionSplits.transactionId, t.id))
    .where(and(eq(t.householdId, householdId), inArray(t.kind, ["expense", "income"])))
    .groupBy(t.id)
    .orderBy(desc(t.date), desc(t.createdAt))
    .limit(5000);
  const out = new Map<string, Learned>();
  const recent = new Map<string, string[]>();
  for (const r of rows) {
    const key = merchantKey(r.description);
    if (!key) continue;
    const cur = out.get(key);
    // A mais recente com categoria manda na categoria; a mais recente com divisão, na divisão.
    if (!cur) out.set(key, { categoryId: r.categoryId, participantIds: r.participantIdsCsv ? r.participantIdsCsv.split(",") : [], consistent: true, seen: 1 });
    else {
      cur.seen++;
      if (!cur.categoryId && r.categoryId) cur.categoryId = r.categoryId;
      if (cur.participantIds.length === 0 && r.participantIdsCsv) cur.participantIds = r.participantIdsCsv.split(",");
    }
    const list = recent.get(key) ?? [];
    if (list.length < REUSE_WINDOW) list.push(`${r.categoryId ?? ""}|${(r.participantIdsCsv ? r.participantIdsCsv.split(",") : []).sort().join(",")}`);
    recent.set(key, list);
  }
  for (const [key, list] of recent) out.get(key)!.consistent = new Set(list).size === 1;
  return out;
}

/** Categoria de uma compra pelo histórico do estabelecimento (quando as regras não decidiram). */
export async function historyCategory(householdId: string, description: string): Promise<string | null> {
  const key = merchantKey(description);
  if (!key) return null;
  return (await learnedByMerchant(householdId)).get(key)?.categoryId ?? null;
}

/**
 * Lançamentos sem categoria de um lugar que já tem categoria em outro lançamento: recebem a mesma.
 * Ex.: "99Food" de outubro sem categoria, e o de novembro em Delivery → o de outubro vai para Delivery.
 */
export async function classifyFromHistory(householdId: string): Promise<number> {
  const db = getDb();
  const open = await db
    .select({ id: t.id, description: t.description })
    .from(t)
    .where(and(eq(t.householdId, householdId), isNull(t.categoryId), eq(t.kind, "expense")))
    .limit(500);
  if (open.length === 0) return 0;
  const learned = await learnedByMerchant(householdId);
  const byCategory = new Map<string, string[]>();
  for (const o of open) {
    const cat = learned.get(merchantKey(o.description))?.categoryId;
    if (cat) byCategory.set(cat, [...(byCategory.get(cat) ?? []), o.id]);
  }
  let n = 0;
  for (const [categoryId, ids] of byCategory) {
    const done = await updateReturning(db, t, { categoryId }, and(eq(t.householdId, householdId), isNull(t.categoryId), inArray(t.id, ids)), { id: t.id });
    n += done.length;
  }
  return n;
}
