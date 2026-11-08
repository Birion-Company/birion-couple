"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { setTransactionsStatus } from "@/app/actions/transactions";
import { toastResult } from "./toaster";

/** Marca um lançamento como acertado (sai de quem deve para quem). */
export function SettleButton({ id, statusId, label }: { id: string; statusId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn small ghost"
      disabled={pending}
      aria-label={`Marcar "${label}" como acertado`}
      onClick={() =>
        start(async () => {
          const r = await setTransactionsStatus([id], statusId);
          toastResult(r);
          if (r.ok) router.refresh();
        })
      }
    >
      <Check size={14} strokeWidth={2} /> Acertado
    </button>
  );
}
