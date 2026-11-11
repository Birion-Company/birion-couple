/**
 * Enquanto a próxima tela carrega (no site, ela vem do servidor), mostra na hora um esqueleto da
 * página: o toque no menu responde de imediato, em vez de parecer travado até tudo chegar.
 */
export default function Loading() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label="Carregando">
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="sk-grid">
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
