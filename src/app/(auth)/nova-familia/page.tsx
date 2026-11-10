import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewHouseholdForm } from "@/components/auth/new-household-form";
import { getAuth, getHomeless } from "@/lib/auth";

export const metadata: Metadata = { title: "Nova família" };

/** Quem ficou sem família só chega aqui: o resto do app fica bloqueado até criar uma nova. */
export default async function NewHouseholdPage() {
  if (await getAuth()) redirect("/painel");
  const me = await getHomeless();
  if (!me) redirect("/entrar");
  return <NewHouseholdForm name={me.name} />;
}
