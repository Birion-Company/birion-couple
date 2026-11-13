import { NextResponse } from "next/server";
import { decideApproval } from "@/app/actions/approvals";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Aceita um lançamento direto da notificação (botão "Aceitar"). Usa a sessão de quem está logado no aparelho. */
export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { transactionId?: string };
  const res = await decideApproval({ transactionId: String(body.transactionId ?? ""), decision: "accepted" });
  return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
