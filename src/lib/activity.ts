import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isAdmin, type Viewer } from "./access";
import { after } from "next/server";
import { formatMoney } from "./money";
import { pushActivity } from "./push-server";
import type { Lookups } from "./queries";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type Split = { participantId: string; amountCents: number };

/** Retrato de um lançamento, guardado na atividade para montar a frase depois. */
export type TxSnapshot = {
  description: string;
  amountCents: number;
  kind: string;
  date: string;
  payerId: string | null;
  categoryId: string | null;
  projectId: string | null;
  /** Registros antigos guardam o status escolhido à mão. */
  statusId?: string | null;
  settled?: boolean;
  cardId: string | null;
  splits: Split[];
};

export type Change = { field: "amount" | "description" | "date" | "kind" | "payer" | "category" | "project" | "status" | "settled" | "card" | "splits"; from: unknown; to: unknown };

/** Item de uma ação em lote; cada pessoa só vê os itens que a envolvem. */
export type ActivityItem = { d: string; a: string[] };

export type ActivityData = {
  tx?: TxSnapshot;
  changes?: Change[];
  seriesKind?: string | null;
  seriesCount?: number | null;
  statusId?: string;
  settled?: boolean;
  /** Pagamento de uma dívida: quanto foi pago e quanto era devido (a diferença é o valor a mais). */
  paidCents?: number;
  owedCents?: number;
  /** Pagou a menos e o resto continua como dívida. */
  restCents?: number;
  fileName?: string;
  items?: ActivityItem[];
  /** Edição em lote: nomes dos campos alterados ("quem pagou", "divisão"…). */
  fields?: string[];
  /** Confirmação: aceitou ou recusou, e por quê. */
  decision?: "accepted" | "refused";
  reason?: string | null;
};

export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "status"
  | "bulk"
  | "series_deleted"
  | "stopped"
  | "imported"
  | "import_deleted"
  | "batch"
  /** Um membro aceitou ou recusou um lançamento que alguém colocou no nome dele. */
  | "approval";

/** Pessoas envolvidas num lançamento: quem pagou e quem tem parte. */
export function involved(...snaps: (Pick<TxSnapshot, "payerId" | "splits"> | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const s of snaps) {
    if (!s) continue;
    if (s.payerId) ids.add(s.payerId);
    for (const x of s.splits) ids.add(x.participantId);
  }
  return [...ids];
}

/** Lê o retrato atual de lançamentos (com a divisão). */
export async function snapshots(db: Conn, householdId: string, ids: string[]): Promise<Map<string, TxSnapshot & { createdBy: string | null }>> {
  const out = new Map<string, TxSnapshot & { createdBy: string | null }>();
  if (ids.length === 0) return out;
  const t = schema.transactions;
  const rows = await db
    .select({
      id: t.id,
      description: t.description,
      amountCents: t.amountCents,
      kind: t.kind,
      date: t.date,
      payerId: t.payerId,
      categoryId: t.categoryId,
      projectId: t.projectId,
      settled: t.settled,
      cardId: t.cardId,
      createdBy: t.createdBy,
    })
    .from(t)
    .where(and(eq(t.householdId, householdId), inArray(t.id, ids)));
  const splits = await db
    .select()
    .from(schema.transactionSplits)
    .where(inArray(schema.transactionSplits.transactionId, ids));
  for (const r of rows) {
    const { id, ...rest } = r;
    out.set(id, { ...rest, splits: splits.filter((s) => s.transactionId === id).map((s) => ({ participantId: s.participantId, amountCents: s.amountCents })) });
  }
  return out;
}

/** O que mudou entre dois retratos do mesmo lançamento. */
export function diff(before: TxSnapshot, after: TxSnapshot): Change[] {
  const out: Change[] = [];
  const add = (field: Change["field"], a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field, from: a, to: b });
  };
  add("amount", before.amountCents, after.amountCents);
  add("description", before.description, after.description);
  add("date", before.date, after.date);
  add("kind", before.kind, after.kind);
  add("payer", before.payerId, after.payerId);
  add("category", before.categoryId, after.categoryId);
  add("project", before.projectId, after.projectId);
  add("settled", before.settled ?? false, after.settled ?? false);
  add("card", before.cardId, after.cardId);
  const norm = (s: Split[]) => [...s].sort((x, y) => x.participantId.localeCompare(y.participantId));
  add("splits", norm(before.splits), norm(after.splits));
  return out;
}

export async function logActivity(
  db: Conn,
  viewer: Viewer,
  entry: { action: ActivityAction; transactionId?: string | null; data: ActivityData; audience: string[] },
) {
  await db.insert(schema.activities).values({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: entry.action,
    transactionId: entry.transactionId ?? null,
    data: entry.data,
    audience: [...new Set(entry.audience)],
  });
  // Notificação no celular de quem foi envolvido, depois da resposta (não atrasa quem fez a ação).
  const job = () => pushActivity(viewer.householdId, viewer.userId, entry as Parameters<typeof pushActivity>[2]).catch((e) => console.error("push", e));
  try {
    after(job);
  } catch {
    void job();
  }
}

// ---------- Leitura: o popup "o que mudou" ----------

export type FeedItem = { id: string; actor: string; text: string; detail: string | null; when: string; href: string | null; unread: boolean };

const KIND_WORD: Record<string, string> = { expense: "a despesa", income: "a receita", loan: "a dívida", transfer: "o acerto" };
const FIELD: Record<Change["field"], string> = {
  amount: "valor",
  description: "descrição",
  date: "data",
  kind: "tipo",
  payer: "quem pagou",
  category: "categoria",
  project: "projeto",
  status: "status",
  settled: "acertado",
  card: "cartão",
  splits: "quem deveria pagar",
};
const KIND_NAME: Record<string, string> = { expense: "despesa", income: "receita", loan: "dívida", transfer: "acerto" };

/**
 * Atividades de outras pessoas que envolvem esta pessoa, já em frases.
 * Por padrão só as não vistas; com `all`, as dos últimos 60 dias (vistas ou não) para o sino.
 */
export async function getActivityFeed(
  viewer: Viewer,
  lookups: Lookups,
  currency: string,
  opts: { all?: boolean; /** Auditoria: tudo da família, de todo mundo, sem "já visto". */ audit?: boolean; limit?: number } = {},
): Promise<FeedItem[]> {
  const db = getDb();
  if (!isAdmin(viewer) && !viewer.participantId) return [];
  const [m] = opts.audit
    ? [{ seen: new Date(0) }]
    : await db
        .select({ seen: schema.memberships.activitySeenAt })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.householdId, viewer.householdId), eq(schema.memberships.userId, viewer.userId)));
  if (!m) return [];
  const a = schema.activities;
  const rows = await db
    .select({ id: a.id, action: a.action, transactionId: a.transactionId, data: a.data, audience: a.audience, createdAt: a.createdAt, actor: schema.users.name })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.actorUserId))
    .where(
      and(
        eq(a.householdId, viewer.householdId),
        opts.audit ? undefined : or(isNull(a.actorUserId), ne(a.actorUserId, viewer.userId)),
        gt(a.createdAt, opts.audit ? new Date(0) : opts.all ? new Date(Date.now() - 60 * 86400000) : m.seen),
        isAdmin(viewer) ? undefined : sql`${a.audience} @> ${JSON.stringify([viewer.participantId])}::jsonb`,
      ),
    )
    .orderBy(desc(a.createdAt))
    .limit(opts.limit ?? 30);

  const me = viewer.participantId;
  const person = (id: unknown) => (typeof id === "string" ? (id === me ? "você" : lookups.participants.find((p) => p.id === id)?.name ?? "alguém") : "ninguém");
  const nameIn = (list: { id: string; name: string }[], id: unknown, none: string) =>
    typeof id === "string" ? list.find((x) => x.id === id)?.name ?? "(removido)" : none;
  const money = (c: number) => formatMoney(c, currency);
  const describeChange = (c: Change) => {
    // Divisão: para quem lê, o que importa é a própria parte.
    if (c.field === "splits" && me) {
      const mine = (x: unknown) => (x as Split[]).find((s) => s.participantId === me)?.amountCents ?? 0;
      const [a, b] = [mine(c.from), mine(c.to)];
      if (a !== b) return `sua parte: ${money(a)} → ${money(b)}`;
    }
    const v = (x: unknown) => {
      switch (c.field) {
        case "amount":
          return money(Number(x));
        case "date":
          return typeof x === "string" ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : "";
        case "kind":
          return KIND_NAME[String(x)] ?? String(x);
        case "payer":
          return person(x);
        case "category":
          return nameIn(lookups.categories, x, "sem categoria");
        case "project":
          return nameIn(lookups.projects, x, "nenhum");
        case "status":
          return nameIn(lookups.statuses, x, "sem status");
        case "settled":
          return x ? "acertado" : "não acertado";
        case "card":
          return nameIn(lookups.cards, x, "sem cartão");
        case "splits":
          return (x as Split[]).map((s) => `${person(s.participantId)} ${money(s.amountCents)}`).join(", ") || "ninguém";
        default:
          return `"${String(x)}"`;
      }
    };
    return `${FIELD[c.field]}: ${v(c.from)} → ${v(c.to)}`;
  };
  const myPart = (tx: TxSnapshot) => {
    if (!me) return null;
    if (tx.kind === "loan" || tx.kind === "transfer") {
      const to = tx.splits[0]?.participantId;
      return `${person(tx.payerId)} → ${person(to)}`;
    }
    const share = tx.splits.find((s) => s.participantId === me)?.amountCents;
    const parts = [];
    if (share) parts.push(`sua parte: ${money(share)}`);
    if (tx.payerId) parts.push(`${tx.kind === "income" ? "quem recebeu" : "quem pagou"}: ${person(tx.payerId)}`);
    return parts.join(" · ") || null;
  };
  /** Frases diretas quando o lançamento cria uma dívida para (ou a favor de) quem lê. */
  const assignedToMe = (actor: string, tx: TxSnapshot): [string, string | null] | null => {
    if (!me) return null;
    const to = tx.splits[0]?.participantId;
    if (tx.kind === "loan") {
      if (to === me) return [`${actor} registrou uma dívida: você deve ${money(tx.amountCents)} para ${person(tx.payerId)}`, `"${tx.description}"`];
      if (tx.payerId === me) return [`${actor} registrou que ${person(to)} te deve ${money(tx.amountCents)}`, `"${tx.description}"`];
      return null;
    }
    if (tx.kind === "transfer") {
      if (to === me) return [`${actor} registrou que ${person(tx.payerId)} te pagou ${money(tx.amountCents)}`, "acerto de contas"];
      if (tx.payerId === me) return [`${actor} registrou que você pagou ${money(tx.amountCents)} para ${person(to)}`, "acerto de contas"];
      return null;
    }
    if (tx.kind !== "expense" || !tx.payerId || tx.payerId === me) return null;
    const share = tx.splits.find((s) => s.participantId === me)?.amountCents ?? 0;
    if (share <= 0) return null;
    return [`${actor} atribuiu uma dívida a você: "${tx.description}"`, `você deve ${money(share)} para ${person(tx.payerId)}${tx.splits.length > 1 ? ` · total ${money(tx.amountCents)}` : ""}`];
  };
  const visibleItems = (items: ActivityItem[] = []) => (isAdmin(viewer) ? items : items.filter((i) => me && i.a.includes(me)));

  const out: FeedItem[] = [];
  for (const r of rows) {
    const d = r.data as ActivityData;
    const actor = r.actor ?? "Alguém";
    const tx = d.tx;
    let text = "";
    let detail: string | null = null;
    let href: string | null = r.transactionId ? `/transacoes/${r.transactionId}` : null;
    switch (r.action) {
      case "created": {
        if (!tx) continue;
        const assigned = assignedToMe(actor, tx);
        if (assigned) {
          [text, detail] = assigned;
          break;
        }
        const series = d.seriesKind === "installment" ? ` em ${d.seriesCount} parcelas` : d.seriesKind === "monthly" ? (d.seriesCount ? ` por ${d.seriesCount} meses` : " todo mês") : "";
        text = `${actor} lançou ${KIND_WORD[tx.kind] ?? "o lançamento"} "${tx.description}" de ${money(tx.amountCents)}${series}`;
        detail = myPart(tx);
        break;
      }
      case "updated": {
        if (!tx) continue;
        text = `${actor} alterou "${tx.description}"`;
        detail = (d.changes ?? []).map(describeChange).join(" · ") || null;
        break;
      }
      case "deleted": {
        href = null;
        if (tx) {
          text = `${actor} excluiu "${tx.description}" (${money(tx.amountCents)})`;
          break;
        }
        const items = visibleItems(d.items);
        if (items.length === 0) continue;
        text = items.length === 1 ? `${actor} excluiu "${items[0].d}"` : `${actor} excluiu ${items.length} lançamentos`;
        detail = items.length > 1 ? items.slice(0, 4).map((i) => i.d).join(", ") + (items.length > 4 ? "…" : "") : null;
        break;
      }
      case "series_deleted": {
        const n = visibleItems(d.items).length;
        if (!tx || n === 0) continue;
        text = `${actor} excluiu ${n} ${n === 1 ? "lançamento" : "lançamentos"} de "${tx.description}"`;
        href = null;
        break;
      }
      case "stopped":
        if (!tx) continue;
        text = `${actor} parou de repetir "${tx.description}"`;
        href = null;
        break;
      case "status":
      case "bulk": {
        const items = visibleItems(d.items);
        if (items.length === 0) continue;
        const what = r.action !== "status" ? "" : d.settled !== undefined ? `como "${d.settled ? "pago" : "não pago"}"` : `como "${nameIn(lookups.statuses, d.statusId, "sem status")}"`;
        text =
          r.action === "status" && d.paidCents !== undefined
            ? `${actor} registrou ${d.restCents ? "um pagamento parcial" : "o pagamento"} de "${items[0].d}"`
            : r.action === "status"
            ? `${actor} marcou ${items.length === 1 ? `"${items[0].d}"` : `${items.length} lançamentos`} ${what}`
            : `${actor} mudou ${items.length === 1 ? `"${items[0].d}"` : `${items.length} lançamentos`}`;
        if (r.action === "bulk" && d.fields?.length) {
          detail = `mudou ${d.fields.join(", ")}` + (items.length > 1 ? ` · ${items.slice(0, 3).map((i) => i.d).join(", ")}${items.length > 3 ? "…" : ""}` : "");
          break;
        }
        if (r.action === "status" && d.paidCents !== undefined && d.owedCents !== undefined) {
          const diff = d.paidCents - d.owedCents;
          detail = `pagou ${formatMoney(d.paidCents, currency)}${d.restCents ? ` · falta ${formatMoney(d.restCents, currency)}` : diff > 0 ? ` · ${formatMoney(diff, currency)} a mais` : ""}`;
          break;
        }
        detail = items.length > 1 ? items.slice(0, 4).map((i) => i.d).join(", ") + (items.length > 4 ? "…" : "") : (d.changes ?? []).map(describeChange).join(" · ") || null;
        href = items.length === 1 ? href : null;
        break;
      }
      case "approval": {
        const items = visibleItems(d.items);
        if (items.length === 0) continue;
        text = `${actor} ${d.decision === "accepted" ? "aceitou" : "recusou"} "${items[0].d}"`;
        detail = d.decision === "refused" ? (d.reason ? `motivo: ${d.reason}` : "não vale nas dívidas até você corrigir") : "já vale nas dívidas";
        break;
      }
      case "batch": {
        const items = visibleItems(d.items);
        if (items.length === 0) continue;
        text = `${actor} lançou ${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"} de uma vez`;
        detail = items.slice(0, 4).map((i) => i.d).join(", ") + (items.length > 4 ? "…" : "");
        href = null;
        break;
      }
      case "imported": {
        const n = visibleItems(d.items).length;
        if (n === 0) continue;
        text = `${actor} importou ${n} ${n === 1 ? "lançamento" : "lançamentos"} de "${d.fileName ?? "arquivo"}" que envolvem ${isAdmin(viewer) ? "a família" : "você"}`;
        href = null;
        break;
      }
      case "import_deleted": {
        const n = visibleItems(d.items).length;
        if (n === 0) continue;
        text = `${actor} apagou a importação "${d.fileName ?? "arquivo"}" (${n} ${n === 1 ? "lançamento" : "lançamentos"})`;
        href = null;
        break;
      }
      default:
        continue;
    }
    out.push({ id: r.id, actor, text, detail, when: r.createdAt.toISOString(), href, unread: r.createdAt > m.seen });
  }
  return out;
}
