"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteImport } from "@/app/actions/import";
import { toastResult } from "./toaster";

/** Botão para apagar uma importação e todos os lançamentos que vieram dela. */
export function DeleteImportButton({ id, fileName, remaining }: { id: string; fileName: string; remaining: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="icon-btn"
      disabled={pending}
      aria-label={`Apagar a importação ${fileName}`}
      title="Apagar importação"
      onClick={() => {
        const what =
          remaining === 0
            ? `Apagar o registro da importação "${fileName}"? Os lançamentos dela já foram excluídos.`
            : `Apagar a importação "${fileName}"? ${remaining === 1 ? "O lançamento que veio" : `Os ${remaining} lançamentos que vieram`} deste arquivo ${remaining === 1 ? "será excluído" : "serão excluídos"}. Não dá para desfazer.`;
        if (!window.confirm(what)) return;
        start(async () => {
          const r = await deleteImport(id);
          toastResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Trash2 size={16} strokeWidth={1.6} />
    </button>
  );
}
