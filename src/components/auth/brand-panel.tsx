/** Painel esquerdo: o logotipo e a arte do nome "Couple" (dois círculos que se cruzam). */
export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="Birion Couple">
      <div className="brand-logo">
        <i className="blogo" aria-hidden />
      </div>
      <div className="brand-content">
        <div className="couple-art" aria-hidden>
          <span className="ring ring-a" />
          <span className="ring ring-b" />
          <p className="couple-title">Couple</p>
        </div>
        <h2 className="brand-title">
          Suas finanças,
          {" "}<br />
          <em>sem complicação.</em>
        </h2>
      </div>
    </section>
  );
}
