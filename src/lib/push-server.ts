import "server-only";
import * as webpush from "web-push";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney } from "./money";
import { wants, type PushKind } from "./push-prefs";

/**
 * Notificações push (chegam no celular com o app fechado, inclusive no iPhone pela Tela de Início).
 * As chaves ficam em variáveis de ambiente; sem elas, nada é enviado (e nada quebra).
 */
const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
export const pushEnabled = Boolean(PUBLIC && PRIVATE);
if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://github.com/Birion-Company/birion-finance", PUBLIC!, PRIVATE!);

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Manda para todos os aparelhos dessas pessoas (usuários). Aparelhos que saíram são esquecidos. */
export async function sendPush(userIds: string[], msg: PushMessage) {
  if (!pushEnabled || userIds.length === 0) return 0;
  const db = getDb();
  const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, [...new Set(userIds)]));
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: a inscrição não existe mais (app removido, permissão retirada).
        if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
        else console.error("push falhou", code ?? e);
      }
    }),
  );
  return sent;
}

/** Manda só uma vez por chave e pessoa (avisos agendados, como "fatura vence amanhã"). */
export async function sendPushOnce(userId: string, key: string, msg: PushMessage) {
  if (!pushEnabled) return false;
  const [first] = await getDb().insert(schema.pushSent).values({ userId, key }).onConflictDoNothing().returning({ key: schema.pushSent.key });
  if (!first) return false;
  await sendPush([userId], { ...msg, tag: msg.tag ?? key });
  return true;
}

/** Usuários (com login) ligados a estas pessoas da família. */
export async function usersOf(householdId: string, participantIds: string[]) {
  if (participantIds.length === 0) return [];
  const rows = await getDb()
    .select({ userId: schema.memberships.userId, participantId: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), isNotNull(schema.memberships.participantId), inArray(schema.memberships.participantId, participantIds)));
  return rows as { userId: string; participantId: string }[];
}

type Snap = { description: string; amountCents: number; kind: string; payerId: string | null; splits: { participantId: string; amountCents: number }[] };
type Entry = {
  action: string;
  transactionId?: string | null;
  data: { tx?: Snap; items?: { d: string; a: string[] }[]; paidCents?: number; owedCents?: number; restCents?: number; decision?: string; reason?: string | null; changes?: { field: string }[]; settled?: boolean; fileName?: string; fields?: string[] };
  audience: string[];
};

/**
 * Avisa por push quem foi envolvido no que alguém fez (a pessoa que fez não recebe).
 * O texto é de quem recebe: "Você ficou devendo R$ 45,00 para Fulano em Mercado".
 */
export async function pushActivity(householdId: string, actorUserId: string, entry: Entry) {
  if (!pushEnabled) return;
  const db = getDb();
  const people = await usersOf(householdId, entry.audience);
  const targets = people.filter((p) => p.userId !== actorUserId);
  if (targets.length === 0) return;
  const prefRows = await db.select({ id: schema.users.id, prefs: schema.users.pushPrefs }).from(schema.users).where(inArray(schema.users.id, targets.map((t) => t.userId)));
  const prefsOf = new Map(prefRows.map((r) => [r.id, r.prefs]));
  const [[actor], parts, [house]] = await Promise.all([
    db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, actorUserId)),
    db.select({ id: schema.participants.id, name: schema.participants.name, ownerUserId: schema.participants.ownerUserId }).from(schema.participants).where(eq(schema.participants.householdId, householdId)),
    db.select({ currency: schema.households.currency }).from(schema.households).where(eq(schema.households.id, householdId)),
  ]);
  const baseWho = actor?.name?.split(" ")[0] ?? "Alguém";
  const baseName = new Map(parts.map((p) => [p.id, p.name]));
  // Contato (sem login) só tem nome para o dono; para os outros é "um contato".
  const ownerOf = new Map(parts.map((p) => [p.id, p.ownerUserId]));
  const loginPids = new Set(
    (
      await db
        .select({ pid: schema.memberships.participantId })
        .from(schema.memberships)
        .where(eq(schema.memberships.householdId, householdId))
    ).map((x) => x.pid),
  );
  // Apelidos que cada pessoa que recebe deu (só para ela) e a pessoa de quem fez a mudança.
  const [nickRows, [actorMember]] = await Promise.all([
    db
      .select({ userId: schema.nicknames.userId, pid: schema.nicknames.participantId, nickname: schema.nicknames.nickname })
      .from(schema.nicknames)
      .where(inArray(schema.nicknames.userId, targets.map((t) => t.userId))),
    db
      .select({ pid: schema.memberships.participantId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, actorUserId), eq(schema.memberships.householdId, householdId))),
  ]);
  const nickOf = new Map(nickRows.map((n) => [`${n.userId}:${n.pid}`, n.nickname]));
  const money = (c: number) => formatMoney(c, house?.currency ?? "BRL");
  const url = entry.transactionId ? `/transacoes/${entry.transactionId}` : "/painel";
  const tx = entry.data.tx;
  const items = entry.data.items ?? [];

  for (const t of targets) {
    const me = t.participantId;
    const nick = (pid: string | null | undefined) => (pid ? nickOf.get(`${t.userId}:${pid}`) : undefined);
    const who = nick(actorMember?.pid) ?? baseWho;
    const nameOf = {
      get: (pid: string) => {
        if (!loginPids.has(pid) && baseName.has(pid) && ownerOf.get(pid) !== t.userId) return "um contato";
        return nick(pid) ?? baseName.get(pid);
      },
    };
    let msg: PushMessage | null = null;
    // Tipo do aviso, para respeitar o que a pessoa escolheu receber.
    let kind: PushKind = "alteracao";
    if (entry.action === "created" && tx) {
      const mine = tx.splits.find((s) => s.participantId === me)?.amountCents ?? 0;
      const others = tx.splits.filter((s) => s.participantId !== tx.payerId && s.amountCents > 0);
      if (tx.kind === "loan" && mine > 0 && tx.payerId !== me) {
        kind = "divida";
        msg = { title: "Nova dívida", body: `Você ficou devendo ${money(tx.amountCents)} para ${nameOf.get(tx.payerId ?? "") ?? who}.` };
      } else if (tx.kind === "transfer") {
        kind = "pagamento";
        msg = { title: "Pagamento registrado", body: `${who} registrou um acerto de ${money(tx.amountCents)} com você.` };
      } else if (tx.payerId && tx.payerId !== me && mine > 0) {
        kind = "divida";
        msg = { title: "Nova dívida", body: `Você ficou devendo ${money(mine)} para ${nameOf.get(tx.payerId) ?? who} em “${tx.description}”.` };
      } else if (tx.payerId === me && others.length) {
        kind = "te-devem";
        msg = { title: "Te devem", body: `${who} lançou “${tx.description}”: ${others.map((o) => `${nameOf.get(o.participantId) ?? "alguém"} ${money(o.amountCents)}`).join(", ")}.` };
      } else msg = { title: "Novo lançamento com você", body: `${who} lançou “${tx.description}” (${money(tx.amountCents)}).` };
    } else if (entry.action === "updated" && tx) {
      // Mudou valor, tipo, quem pagou ou a divisão: precisa confirmar de novo.
      const again = (entry.data.changes ?? []).some((c) => ["amount", "kind", "payer", "splits"].includes(c.field));
      msg = again
        ? { title: "Confirme de novo", body: `${who} mudou “${tx.description}”. Aceite ou recuse.` }
        : { title: "Lançamento alterado", body: `${who} alterou “${tx.description}”. Confira o que mudou.` };
    } else if (entry.action === "approval") {
      kind = "pagamento";
      const d = items[0]?.d ?? "um lançamento";
      msg =
        entry.data.decision === "accepted"
          ? { title: "Aceito", body: `${who} aceitou “${d}”. Já vale nas dívidas.` }
          : { title: "Recusado", body: `${who} recusou “${d}”${entry.data.reason ? `: ${entry.data.reason}` : ""}. Corrija ou exclua.` };
    } else if (entry.action === "deleted") {
      const d = tx?.description ?? items[0]?.d;
      msg = { title: "Lançamento excluído", body: items.length > 1 ? `${who} excluiu ${items.length} lançamentos com você.` : `${who} excluiu “${d}”.` };
    } else if (entry.action === "status" && entry.data.paidCents !== undefined) {
      kind = "pagamento";
      const diff = entry.data.paidCents - (entry.data.owedCents ?? entry.data.paidCents);
      msg = {
        title: "Pagamento registrado",
        body: `${who} registrou o pagamento de ${money(entry.data.paidCents)} em “${items[0]?.d ?? "um lançamento"}”${entry.data.restCents ? ` (falta ${money(entry.data.restCents)})` : diff > 0 ? ` (${money(diff)} de lucro)` : ""}.`,
      };
    } else if (entry.action === "status") {
      kind = "pagamento";
      msg = { title: entry.data.settled ? "Marcado como pago" : "Pagamento desfeito", body: `${who} mexeu em ${items.length === 1 ? `“${items[0].d}”` : `${items.length} lançamentos`} com você.` };
    } else if (entry.action === "imported") {
      kind = "importacao";
      msg = { title: "Extrato importado", body: `${who} importou ${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"} com você${entry.data.fileName ? ` (${entry.data.fileName})` : ""}.` };
    } else if (entry.action === "batch" || entry.action === "bulk") {
      kind = "importacao";
      msg = { title: "Lançamentos com você", body: `${who} ${entry.action === "batch" ? "lançou" : "mudou"} ${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"} com você.` };
    }
    // Quem foi colocado num lançamento novo precisa aceitar ou recusar.
    if (msg && entry.action === "created") msg = { ...msg, body: `${msg.body} Aceite ou recuse.` };
    if (msg && wants(prefsOf.get(t.userId), kind)) await sendPush([t.userId], { ...msg, url });
  }
}
