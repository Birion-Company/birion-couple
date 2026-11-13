"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb } from "@/db";
import { logActivity } from "@/lib/activity";
import { approvalContext, saveDecision } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";
import { getTransaction } from "@/lib/queries";
import type { ActionResult } from "./settings";

const Schema = z.object({
  transactionId: z.uuid(),
  decision: z.enum(["accepted", "refused"]),
  reason: z.string().trim().max(300).optional().nullable(),
});

/**
 * "Para confirmar": aceitar ou recusar um lançamento que outra pessoa colocou no seu nome.
 * Numa série (parcelas, todo mês), vale para a série inteira. Quem lançou é avisado na hora.
 */
export async function decideApproval(input: z.input<typeof Schema>): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const d = parsed.data;
  const me = auth.participantId;
  if (!me) return { ok: false, error: "Sua conta não está ligada a uma pessoa do casal." };
  const tx = await getTransaction(auth, d.transactionId);
  if (!tx) return { ok: false, error: "Lançamento não encontrado." };
  const ctx = await approvalContext(auth.householdId);
  const creatorId = tx.createdBy ? ctx.participantOf.get(tx.createdBy) ?? null : null;
  const pending = !!tx.approval && (tx.approval.waiting.includes(me) || tx.approval.refused.some((r) => r.id === me));
  // Já aceito: dá para voltar atrás e recusar (quem está no lançamento e não foi quem lançou).
  const iAmIn = tx.payerId === me || tx.splits.some((s) => s.participantId === me);
  const changeMind = iAmIn && !!tx.createdBy && tx.createdBy !== auth.userId && d.decision === "refused" && tx.createdAt >= ctx.from;
  if (!pending && !changeMind) return { ok: false, error: "Não há nada para você confirmar neste lançamento." };
  const reason = d.decision === "refused" ? d.reason || null : null;
  await saveDecision(auth.householdId, tx, me, d.decision, reason);
  await logActivity(getDb(), auth, {
    action: "approval",
    transactionId: tx.id,
    data: { decision: d.decision, reason, items: [{ d: tx.description, a: [creatorId ?? "", me].filter(Boolean) }] },
    audience: [creatorId, me].filter((x): x is string => !!x),
  });
  revalidatePath("/", "layout");
  const series = tx.seriesId ? (tx.seriesKind === "monthly" ? " (todos os meses)" : " (todas as parcelas)") : "";
  return { ok: true, message: d.decision === "accepted" ? `Aceito${series}. Já vale nas dívidas.` : `Recusado${series}. Quem lançou foi avisado.` };
}

/** "Aceitar selecionados": aceita vários de uma vez (cada série vale inteira, como no Aceitar). */
export async function acceptApprovals(ids: string[]): Promise<ActionResult> {
  const list = z.array(z.uuid()).min(1).max(200).safeParse(ids);
  if (!list.success) return { ok: false, error: "Escolha pelo menos um lançamento." };
  let ok = 0;
  const errors: string[] = [];
  for (const id of list.data) {
    const r = await decideApproval({ transactionId: id, decision: "accepted" });
    if (r.ok) ok++;
    else if (r.error) errors.push(r.error);
  }
  revalidatePath("/", "layout");
  if (ok === 0) return { ok: false, error: errors[0] ?? "Nada foi aceito." };
  return { ok: true, message: `${ok} ${ok === 1 ? "lançamento aceito" : "lançamentos aceitos"}.${errors.length ? ` ${errors.length} não deu.` : ""}` };
}
