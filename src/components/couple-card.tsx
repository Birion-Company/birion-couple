"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Heart, Share2, Trash2, UserPlus } from "lucide-react";
import { createInvite, removeMember, revokeInvite } from "@/app/actions/settings";
import { Avatar } from "./ui";
import { toast, toastResult } from "./toaster";

type Person = { userId: string; name: string; avatarUrl: string | null; color: string };
type Invite = { id: string; code: string; expiresAt: string };

/**
 * "Nós dois": as duas pessoas do casal. Sem a segunda, aparece o convite: um link sempre à vista, para copiar
 * ou mandar pelo WhatsApp (valem por 1 dia e para uma pessoa só).
 */
export function CoupleCard({ people, invite, meId }: { people: Person[]; invite: Invite | null; meId: string }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const partner = people.find((p) => p.userId !== meId);
  const me = people.find((p) => p.userId === meId);
  const link = invite && typeof window !== "undefined" ? `${window.location.origin}/convite/${invite.code}` : "";
  const text = `Vem organizar as nossas finanças comigo: ${link}`;

  const make = () =>
    start(async () => {
      const r = await createInvite("owner", null, "");
      toastResult({ ...r, message: undefined });
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de copiar (endereço http, por exemplo): o link está no campo ao lado, já selecionado ao tocar.
      toast("Toque no link e copie.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <section className="card couple-card" aria-labelledby="nos" data-tour="people-login">
      <div className="card-head">
        <h2 id="nos">
          <Heart size={16} strokeWidth={1.8} style={{ verticalAlign: -2, marginRight: 6 }} />
          Modo casal{partner ? " · ligado" : ""}
        </h2>
      </div>
      <div className="couple-pair">
        {[me, partner].map((p, i) =>
          p ? (
            <div key={p.userId} className="couple-person">
              <Avatar name={p.name} color={p.color} src={p.avatarUrl} size={44} />
              <p className="title">{p.userId === meId ? "Você" : p.name}</p>
            </div>
          ) : (
            <div key={i} className="couple-person empty">
              <span className="couple-ghost">
                <UserPlus size={20} />
              </span>
              <p className="sub">Falta o seu par</p>
            </div>
          ),
        )}
      </div>

      {!partner && (
        <div className="couple-invite">
          {invite ? (
            <>
              <p className="faint">Mande este link. Vale por 1 dia e para uma pessoa só.</p>
              <div className="actions">
                <input className="input grow" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
                <button type="button" className="btn" onClick={copy}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiado" : "Copiar"}
                </button>
                <button type="button" className="btn primary" onClick={share}>
                  <Share2 size={16} /> Enviar
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={pending}
                  aria-label="Cancelar convite"
                  onClick={() => start(async () => toastResult(await revokeInvite(invite.id)))}
                >
                  <Trash2 size={16} strokeWidth={1.6} />
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn primary" disabled={pending} onClick={make}>
              <UserPlus size={16} /> Convidar parceiro(a)
            </button>
          )}
        </div>
      )}

      {partner && (
        <div className="actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => window.confirm(`Tirar o acesso de ${partner.name}? Os lançamentos continuam guardados.`) && start(async () => toastResult(await removeMember(partner.userId)))}
          >
            Tirar acesso de {partner.name}
          </button>
        </div>
      )}
    </section>
  );
}
