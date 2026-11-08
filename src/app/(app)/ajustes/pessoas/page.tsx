import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PeoplePage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  return (
    <>
      <ListEditor kind="participants" items={participants} />
    </>
  );
}
