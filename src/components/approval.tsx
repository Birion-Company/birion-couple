"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Clock, X } from "lucide-react";
import { decideApproval } from "@/app/actions/approvals";
import { toastResult } from "./toaster";

/** Aceitar ou recusar (com motivo opcional) um lançamento que alguém colocou no seu nome. */
export function ApprovalButtons({ txId, refused = false, series = false }: { txId: string; refused?: boolean; series?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const decide = (decision: "accepted" | "refused") =>
    start(async () => {
      const r = await decideApproval({ transactionId: txId, decision, reason: decision === "refused" ? reason : null });
      toastResult(r);
      if (r.ok) {
        setAsking(false);
        router.refresh();
        window.dispatchEvent(new Event("bf:tx-changed"));
      }
    });
  if (asking) {
    return (
      <div className="approval-refuse">
        <input
          className="input"
          autoFocus
          maxLength={300}
          value={reason}
          placeholder="Por quê? (opcional) Ex.: o valor está errado"
          aria-label="Motivo da recusa"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              decide("refused");
            }
          }}
        />
        <button type="button" className="btn small danger" disabled={pending} onClick={() => decide("refused")}>
          Recusar
        </button>
        <button type="button" className="btn small ghost" onClick={() => setAsking(false)}>
          Voltar
        </button>
      </div>
    );
  }
  return (
    <div className="approval-actions">
      <button type="button" className="btn small primary" disabled={pending} onClick={() => decide("accepted")}>
        <Check size={15} strokeWidth={2.2} /> {refused ? "Aceitar agora" : series ? "Aceitar a série" : "Aceitar"}
      </button>
      {!refused && (
        <button type="button" className="btn small ghost danger" disabled={pending} onClick={() => setAsking(true)}>
          <X size={15} strokeWidth={2.2} /> Recusar
        </button>
      )}
    </div>
  );
}

/** Selo curto para listas: "aguardando Fulano", "Fulano recusou", "aguardando você". */
export function ApprovalBadge({ approval, me, names }: { approval: { waiting: string[]; refused: { id: string }[] } | null; me: string | null; names: Record<string, string> }) {
  if (!approval) return null;
  const name = (id: string) => names[id] ?? "alguém";
  if (approval.refused.length) {
    return (
      <span className="approval-badge refused">
        <X size={11} strokeWidth={2.6} aria-hidden /> {approval.refused.map((r) => (r.id === me ? "você" : name(r.id))).join(", ")} recusou
      </span>
    );
  }
  const mine = me && approval.waiting.includes(me);
  return (
    <span className={`approval-badge ${mine ? "mine" : ""}`}>
      <Clock size={11} strokeWidth={2.4} aria-hidden /> {mine ? "confirme" : `aguardando ${approval.waiting.map(name).join(", ")}`}
    </span>
  );
}
