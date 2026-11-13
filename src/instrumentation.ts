/**
 * Fora do Netlify (servidor local), verifica de hora em hora os avisos agendados de fatura.
 * No Netlify quem faz isso é a função agendada netlify/functions/alertas-fatura.mts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NETLIFY) return;
  // Banco comum (DATABASE_URL): confere e aplica as migrações pendentes ao ligar. MIGRATE_ON_START=0 desliga.
  if (process.env.DATABASE_URL && process.env.MIGRATE_ON_START !== "0") {
    try {
      const { runMigrations } = await import("./lib/migrate");
      const n = await runMigrations();
      if (n) console.log(`[banco] ${n} migração(ões) aplicada(s)`);
    } catch (e) {
      console.error("[banco] migrações falharam: o app continua, mas confira o banco.", e);
    }
  }
  const run = async () => {
    try {
      const { runCardAlertPushes } = await import("./lib/push-alerts");
      const n = await runCardAlertPushes();
      if (n) console.log(`[avisos] ${n} notificação(ões) de fatura enviada(s)`);
    } catch (e) {
      console.error("[avisos] falhou", e);
    }
  };
  setTimeout(run, 30_000);
  setInterval(run, 60 * 60 * 1000);
}
