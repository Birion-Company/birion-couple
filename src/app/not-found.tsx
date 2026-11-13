import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página não encontrada" };

/** Endereço que não existe (ou lançamento que você não pode ver). */
export default function NotFound() {
  return (
    <main className="oops">
      <div className="oops-card">
        { }
        <i className="bmark" aria-hidden style={{ width: 48, height: 48 }} />
        <h1>Página não encontrada</h1>
        <p>Esse endereço não existe, ou é de algo que você não tem acesso.</p>
        <Link href="/painel" className="btn primary">
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
