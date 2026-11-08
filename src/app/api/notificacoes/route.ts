import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Notificações de quem está logado; o sino consulta isto a cada poucos segundos. */
export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lookups = await getLookups(auth.householdId);
  const items = await getActivityFeed(auth, lookups, auth.currency, { all: true });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
