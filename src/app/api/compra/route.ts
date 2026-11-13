import { NextResponse } from "next/server";
import { parsePurchase } from "@/lib/purchase";
import { recordPurchase } from "@/lib/purchase-server";

export const dynamic = "force-dynamic";

/**
 * "Compra recebida": lança uma compra no cartão de quem tem a chave (Ajustes → Automação).
 * POST /api/compra  Authorization: Bearer <chave>  { "description": "UBER *TRIP", "amount": "45,90", "card": "Nubank", "date": "2026-11-12", "externalId": "opcional" }
 * Pensada para um leitor de notificações do banco ou uma integração bancária no futuro.
 */
export async function POST(req: Request) {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!key) return NextResponse.json({ ok: false, error: "Falta a chave (Authorization: Bearer …)." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = parsePurchase(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const res = await recordPurchase(key, parsed.value);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, id: res.id, duplicate: res.duplicate, category: res.category, card: res.card }, { status: res.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
}
