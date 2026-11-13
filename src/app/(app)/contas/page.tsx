import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MoneyTabs } from "@/components/money-tabs";
import { AccountsEditor } from "@/components/accounts-editor";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Contas" };

/** Contas e saldos, só seus: entram em "Minha posição" no painel. */
export default async function AccountsPage() {
  const auth = await requireAuth();
  const rows = await getDb().select().from(schema.accounts).where(eq(schema.accounts.userId, auth.userId)).orderBy(asc(schema.accounts.createdAt));
  return (
    <>
      <MoneyTabs on="contas" />
      <AccountsEditor currency={auth.currency} accounts={rows.map((a) => ({ id: a.id, name: a.name, balanceCents: a.balanceCents, updatedAt: a.updatedAt.toISOString() }))} />
    </>
  );
}
