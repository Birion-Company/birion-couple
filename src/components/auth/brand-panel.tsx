/** Painel esquerdo: marca, título, descrição e benefícios. */
export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="Birion Finance">
      <div className="brand-logo">
        <i className="blogo" aria-hidden />
        <span>
          <em>Finance</em>
        </span>
      </div>
      <div className="brand-content">
        <div className="brand-copy">
          <h2 className="brand-title">
            Suas finanças,
            {" "}<br />
            <em>sem complicação.</em>
          </h2>
        </div>
      </div>
    </section>
  );
}
