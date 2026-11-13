import { ListEditor } from "@/components/list-editor";
import { MergeContact } from "@/components/merge-contact";
import type { AuthContext } from "@/lib/auth";
import { CONTACT_IDLE_DAYS, CONTACTS_ACTIVE_MAX, CONTACTS_TOTAL_MAX } from "@/lib/defaults";
import { getLookups } from "@/lib/queries";

/**
 * Dois tipos de pessoa:
 * - Família (com login): entram no app. Limite do plano, contando você.
 * - Contatos (sem login): quem só divide conta. Limite de ativos; parados e quites saem das listas sozinhos.
 */
export async function PeopleSections({ auth }: { auth: AuthContext }) {
  const { participants } = await getLookups(auth.householdId, auth.userId);
  const members = participants.filter((p) => p.hasLogin);
  const contacts = participants.filter((p) => !p.hasLogin && !p.foreign);
  return (
    <>
      <section className="section" aria-labelledby="contatos" data-tour="people-contacts">
        <h2 id="contatos" style={{ margin: "0 0 4px" }}>Contatos (sem login)</h2>
        <div className="contacts-help">
          <p>
            Pessoas que <strong>entram nas contas, mas não usam o app</strong>. Ex.: sua mãe, um amigo do churrasco, quem divide o aluguel.
            Seus contatos são <strong>só seus</strong>: o seu par não vê o nome deles.
          </p>
          <ul>
            <li>Ficou {CONTACT_IDLE_DAYS} dias sem aparecer e não deve nada? Some das listas sozinho (não é apagado) e volta quando você escreve o nome num lançamento.</li>
            <li>Cabem até {CONTACTS_ACTIVE_MAX} contatos ativos e {CONTACTS_TOTAL_MAX} guardados.</li>
          </ul>
        </div>
        <ListEditor kind="participants" items={contacts} canInvite />
      </section>

      <MergeContact
        contacts={contacts.map((p) => ({ id: p.id, name: p.name }))}
        members={members.filter((p) => p.id !== auth.participantId).map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
