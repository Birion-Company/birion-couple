import Link from "next/link";
import { Crown, Mail, UserPlus } from "lucide-react";
import { Avatar } from "./ui";

type Person = { userId: string; name: string; username: string | null; role: string; avatarUrl: string | null; color: string };

/** Uma barrinha "x de y" (vagas usadas). */
function Meter({ label, used, max, tone }: { label: string; used: number; max: number; tone?: "warn" }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="fam-meter">
      <div className="fam-meter-head">
        <span>{label}</span>
        <strong className="num">
          {used} de {max}
        </strong>
      </div>
      <div className="fam-meter-bar" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <span className={tone === "warn" || used >= max ? "full" : ""} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * "Como a família está": quem está nela e com qual cargo, quantas vagas restam, o que está esperando
 * (convites e pedidos) e atalhos para agir. Substitui a lista seca de rótulos.
 */
export function FamilyOverview({
  people,
  meId,
  isAdmin,
  membersMax,
  adminsMax,
  openInvites,
  pendingRequests,
  createdAt,
  currency,
}: {
  people: Person[];
  meId: string;
  isAdmin: boolean;
  membersMax: number;
  adminsMax: number;
  openInvites: number;
  pendingRequests: number;
  createdAt: string;
  currency: string;
}) {
  const admins = people.filter((p) => p.role === "owner").length;
  const roomLeft = membersMax - people.length;
  return (
    <section className="card section fam-overview" aria-labelledby="como-esta">
      <div className="card-head">
        <h2 id="como-esta">Como a família está</h2>
        <span className="faint">desde {createdAt} · {currency}</span>
      </div>

      <ul className="fam-people" aria-label="Pessoas com login">
        {people.map((p) => (
          <li key={p.userId}>
            <Avatar name={p.name} color={p.color} src={p.avatarUrl} size={38} />
            <span className="fam-person">
              <strong>
                {p.name}
                {p.userId === meId && <span className="faint"> · você</span>}
              </strong>
              {p.username && <span className="faint">@{p.username}</span>}
            </span>
            {p.role === "owner" ? (
              <span className="badge fam-admin">
                <Crown size={12} strokeWidth={2} aria-hidden /> Administra
              </span>
            ) : (
              <span className="badge">Membro</span>
            )}
          </li>
        ))}
      </ul>

      <div className="fam-meters">
        <Meter label="Pessoas com login" used={people.length} max={membersMax} />
        <Meter label="Administradores" used={admins} max={adminsMax} />
      </div>
      <p className="faint fam-note">
        {isAdmin ? "Você administra: vê e altera tudo da família." : "Você é membro: vê o que envolve você."} Seus contatos sem login são só seus.
      </p>

      <div className="fam-actions">
        {openInvites > 0 && (
          <Link href="/ajustes/membros" className="fam-chip">
            <Mail size={15} aria-hidden /> {openInvites} {openInvites === 1 ? "convite aberto" : "convites abertos"}
          </Link>
        )}
        {isAdmin && pendingRequests > 0 && (
          <a href="#pedidos" className="fam-chip warn">
            {pendingRequests} {pendingRequests === 1 ? "pedido esperando" : "pedidos esperando"} resposta
          </a>
        )}
        {roomLeft > 0 && (
          <Link href="/ajustes/membros" className="btn small primary">
            <UserPlus size={15} aria-hidden /> {isAdmin ? "Convidar alguém" : "Pedir convite"}
          </Link>
        )}
        {roomLeft <= 0 && <span className="faint">A família está cheia ({membersMax} pessoas).</span>}
      </div>
    </section>
  );
}
