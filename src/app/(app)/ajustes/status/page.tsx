import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Status" };

export default async function StatusPage() {
  const auth = await requireAuth();
  const { statuses } = await getLookups(auth.householdId);
  return (
    <>
      <ListEditor kind="statuses" items={statuses} />
    </>
  );
}
