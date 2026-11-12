"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Algo deu errado numa tela do app: em português, com "Tentar de novo". */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="oops-card oops-inline" role="alert">
      <h1>Algo deu errado</h1>
      <p>Não conseguimos abrir esta tela agora. Seus dados estão salvos. Tente de novo; se continuar, volte ao painel.</p>
      {error.digest && <p className="faint">Código do erro: {error.digest}</p>}
      <div className="actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn primary" onClick={() => reset()}>
          Tentar de novo
        </button>
        <Link href="/painel" className="btn">
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
