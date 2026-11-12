import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

/**
 * Ferramentas para listas grandes (centenas ou milhares de linhas): busca no servidor e páginas.
 * Tudo vai na URL (?q=…&p=2), então dá para voltar, recarregar e mandar o link.
 */
type Params = Record<string, string | undefined>;

const href = (base: string, params: Params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

/** Caixa de busca (formulário GET): mantém os outros filtros e volta para a página 1. */
export function SearchForm({ base, q, placeholder, keep = {} }: { base: string; q?: string; placeholder: string; keep?: Params }) {
  return (
    <form action={base} method="get" className="list-search" role="search">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search size={16} strokeWidth={1.9} aria-hidden />
      <input className="input" type="search" name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn small">Buscar</button>
      {q ? (
        <Link className="btn small ghost" href={href(base, keep)}>
          Limpar
        </Link>
      ) : null}
    </form>
  );
}

/** "Página 2 de 50 · 1.000 resultados", com anterior e próxima. */
export function Pager({ base, page, pages, total, params = {}, noun = ["resultado", "resultados"] }: { base: string; page: number; pages: number; total: number; params?: Params; noun?: [string, string] }) {
  return (
    <nav className="pager" aria-label="Páginas">
      <span className="faint num">
        {total.toLocaleString("pt-BR")} {total === 1 ? noun[0] : noun[1]}
        {pages > 1 ? ` · página ${page} de ${pages}` : ""}
      </span>
      {pages > 1 && (
        <span className="pager-buttons">
          {page > 1 ? (
            <Link className="btn small" href={href(base, { ...params, p: page - 1 > 1 ? String(page - 1) : undefined })} aria-label="Página anterior">
              <ChevronLeft size={15} /> Anterior
            </Link>
          ) : null}
          {page < pages ? (
            <Link className="btn small" href={href(base, { ...params, p: String(page + 1) })} aria-label="Próxima página">
              Próxima <ChevronRight size={15} />
            </Link>
          ) : null}
        </span>
      )}
    </nav>
  );
}

export { href as listHref };
