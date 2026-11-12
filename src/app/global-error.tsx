"use client";

/** Erro na própria estrutura do site (raro): página mínima, em português. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f1d38", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Algo deu errado no Birion Finance</h1>
          <p>Seus dados estão salvos. Tente de novo em instantes.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#1ac4db", color: "#0f1d38", fontWeight: 700 }}>
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
