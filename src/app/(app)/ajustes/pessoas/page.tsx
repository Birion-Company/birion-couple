import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { ListEditor } from "@/components/list-editor";
import { Avatar } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { CONTACT_IDLE_DAYS, CONTACTS_TOTAL_MAX, MEMBERS_MAX } from "@/lib/defaults";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Pessoas" };

/**
 * Dois tipos de pessoa:
 * - Família (com login): entram no app. Limite do plano, contando você.
 * - Contatos (sem login): quem só divide conta. Limite de ativos; parados e quites saem das listas sozinhos.
 */
export default async function PeoplePage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  const members = participants.filter((p) => p.hasLogin);
  const contacts = participants.filter((p) => !p.hasLogin);
  const owner = auth.role === "owner";
  return (
    <>
      <section className="card section" aria-labelledby="familia" data-tour="people-login">
        <div className="card-head">
          <h2 id="familia">Família (com login)</h2>
          <span className={`faint num ${members.length >= MEMBERS_MAX ? "neg" : ""}`}>
            {members.length} de {MEMBERS_MAX}, contando você
          </span>
        </div>
        <p className="faint">Entram no app, veem o que os envolve e recebem avisos.</p>
        <div className="rows" style={{ marginTop: 8 }}>
          {members.map((p) => (
            <div key={p.id} className="row">
              <Avatar name={p.name} color={p.color} src={p.avatarUrl} />
              <div className="grow">
                <p className="title">
                  {p.name}
                  {p.id === auth.participantId && <span className="faint"> · você</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
        {owner && members.length < MEMBERS_MAX && (
          <div className="actions" style={{ marginTop: 12 }}>
            <Link className="btn" href="/ajustes/membros">
              <UserPlus size={16} /> Convidar alguém
            </Link>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="contatos" data-tour="people-contacts">
        <h2 id="contatos" style={{ margin: "0 0 4px" }}>Contatos (sem login)</h2>
        <div className="contacts-help">
          <p>
            Pessoas que <strong>entram nas contas, mas não usam o app</strong>. Ex.: sua mãe, um amigo do churrasco, quem divide o aluguel.
          </p>
          <ul>
            <li>Ficou {CONTACT_IDLE_DAYS} dias sem aparecer e não deve nada? Some das listas sozinho (não é apagado) e volta quando você escreve o nome num lançamento.</li>
            <li>Quer que ele use o app? Toque no aviãozinho para mandar um convite.</li>
            <li>Cabem até {CONTACTS_TOTAL_MAX} contatos guardados.</li>
          </ul>
        </div>
        <ListEditor kind="participants" items={contacts} canInvite={owner} />
      </section>
    </>
  );
}
