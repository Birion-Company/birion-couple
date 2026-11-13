import Link from "next/link";

/** Contas e cartões ficam juntos no menu: um alternador no alto das duas páginas. */
export function MoneyTabs({ on }: { on: "contas" | "cartoes" }) {
  return (
    <nav className="tx-tabs" aria-label="Contas ou cartões">
      <Link href="/contas" className={on === "contas" ? "on" : ""} aria-current={on === "contas" ? "page" : undefined}>
        Contas
      </Link>
      <Link href="/cartoes" className={on === "cartoes" ? "on" : ""} aria-current={on === "cartoes" ? "page" : undefined}>
        Cartões
      </Link>
    </nav>
  );
}
