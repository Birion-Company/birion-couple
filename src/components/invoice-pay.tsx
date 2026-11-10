"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { setInvoicePaid } from "@/app/actions/transactions";
import { toastResult } from "./toaster";

/** Marca a fatura como paga (as compras dela viram "Pago") ou desfaz. */
export function InvoicePayButton({ cardId, invoice, paid, label }: { cardId: string; invoice: string; paid: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`btn small ${paid ? "ghost" : ""}`}
      disabled={pending}
      aria-label={paid ? `Desmarcar a fatura ${label} como paga` : `Marcar a fatura ${label} como paga`}
      onClick={() =>
        start(async () => {
          const r = await setInvoicePaid(cardId, invoice, !paid);
          toastResult(r);
          if (r.ok) router.refresh();
        })
      }
    >
      {paid ? <Undo2 size={14} strokeWidth={2} /> : <Check size={14} strokeWidth={2} />} {paid ? "Desfazer" : "Marcar como paga"}
    </button>
  );
}
