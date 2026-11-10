/** Todo dia às 8h (Brasília): avisa por push quem tem fatura fechando ou vencendo. */
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("faltam URL ou CRON_SECRET", { status: 500 });
  const r = await fetch(`${base}/api/cron/alertas`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  return new Response(await r.text(), { status: r.status });
};

export const config = { schedule: "0 11 * * *" };
