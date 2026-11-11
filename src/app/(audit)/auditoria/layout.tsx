import Link from "next/link";
import { Eye, LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { requireAuditor } from "@/lib/auth";

/** Área de auditoria: só leitura, fora do app das famílias (sem menu de lançamentos). */
export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const auditor = await requireAuditor();
  return (
    <div className="audit-shell">
      <header className="audit-top">
        <Link href="/auditoria" className="audit-brand">
          <Eye size={18} strokeWidth={1.8} aria-hidden /> Birion - Auditoria
        </Link>
        <span className="audit-ro">Só leitura</span>
        <span className="grow" />
        <span className="faint hide-sm">{auditor.email}</span>
        <form action={logout}>
          <button className="btn small ghost" type="submit">
            <LogOut size={15} strokeWidth={1.8} /> Sair
          </button>
        </form>
      </header>
      <main className="audit-main">{children}</main>
    </div>
  );
}
