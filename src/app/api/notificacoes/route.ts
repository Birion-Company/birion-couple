import { eq, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Notificações de quem está logado; o sino consulta isto de tempos em tempos.
 * Com ?desde=<data da última novidade que o sino já tem>: se nada mudou na família, responde só
 * { changed: false } (uma consulta leve) em vez de montar a lista inteira.
 */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [row] = await getDb()
    .select({ at: max(schema.activities.createdAt) })
    .from(schema.activities)
    .where(eq(schema.activities.householdId, auth.householdId));
  const last = row?.at?.toISOString() ?? "";
  const since = new URL(req.url).searchParams.get("desde");
  const headers = { "Cache-Control": "no-store" };
  if (since !== null && since === last) return NextResponse.json({ changed: false, last }, { headers });
  const lookups = await getLookups(auth.householdId, auth.userId);
  const items = await getActivityFeed(auth, lookups, auth.currency, { all: true });
  return NextResponse.json({ changed: true, last, items }, { headers });
}
