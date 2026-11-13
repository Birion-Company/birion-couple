import { CleanPeopleToggle } from "@/components/clean-people-toggle";
import { ListEditor } from "@/components/list-editor";
import { MergeContact } from "@/components/merge-contact";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { AuthContext } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

/** Pessoas (sem login) que entram nas contas: fixar, guardar e, se a pessoa quiser, apagar as paradas. */
export async function PeopleSections({ auth }: { auth: AuthContext }) {
  const [{ participants }, [me]] = await Promise.all([
    getLookups(auth.householdId, auth.userId),
    getDb().select({ clean: schema.users.cleanPeople }).from(schema.users).where(eq(schema.users.id, auth.userId)),
  ]);
  const members = participants.filter((p) => p.hasLogin);
  const contacts = participants.filter((p) => !p.hasLogin && !p.foreign);
  return (
    <>
      <section className="section" aria-labelledby="pessoas" data-tour="people-contacts">
        <h2 id="pessoas" style={{ margin: "0 0 8px" }}>Pessoas</h2>
        <CleanPeopleToggle on={!!me?.clean} />
        <ListEditor kind="participants" items={contacts} cleanPeople={!!me?.clean} />
      </section>

      <MergeContact
        contacts={contacts.map((p) => ({ id: p.id, name: p.name }))}
        members={members.filter((p) => p.id !== auth.participantId).map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
