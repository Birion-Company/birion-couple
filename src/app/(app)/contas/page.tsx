import type { Metadata } from "next";
import { MoneyTabs } from "@/components/money-tabs";
import { AccountsEditor } from "@/components/accounts-editor";
import { accountBalances } from "@/lib/account-balances";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Contas" };

/** Contas, só suas: o saldo vem das receitas e despesas lançadas nelas e entra em "Minha posição" no Início. */
export default async function AccountsPage() {
  const auth = await requireAuth();
  const rows = await accountBalances(auth.userId);
  return (
    <>
      <MoneyTabs on="contas" />
      <AccountsEditor
        currency={auth.currency}
        accounts={rows.map((a) => ({ id: a.id, name: a.name, openingCents: a.openingCents, inCents: a.inCents, outCents: a.outCents, balanceCents: a.balanceCents }))}
      />
    </>
  );
}
