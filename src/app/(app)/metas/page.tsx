import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { GoalsEditor } from "@/components/goals-editor";
import { requireAuth } from "@/lib/auth";
import { todayIn } from "@/lib/cards";

export const metadata: Metadata = { title: "Metas" };

/** Metas de economia, só suas. */
export default async function GoalsPage() {
  const auth = await requireAuth();
  const goals = await getDb().select().from(schema.goals).where(and(eq(schema.goals.userId, auth.userId), eq(schema.goals.shared, false))).orderBy(asc(schema.goals.targetMonth), asc(schema.goals.createdAt));
  return <GoalsEditor currency={auth.currency} nowMonth={todayIn().slice(0, 7)} goals={goals.map((g) => ({ id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents, targetMonth: g.targetMonth }))} />;
}
