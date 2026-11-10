import { NextResponse } from "next/server";
import { runCardAlertPushes } from "@/lib/push-alerts";

export const dynamic = "force-dynamic";

/** Dispara os avisos agendados (fatura fechando/vencendo). Chamado pela função agendada do Netlify. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sent = await runCardAlertPushes();
  return NextResponse.json({ sent });
}
