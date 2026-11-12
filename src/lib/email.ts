import "server-only";

/**
 * Envio de e-mail pelo Resend (https://resend.com), direto pela API (sem pacote extra).
 * - RESEND_API_KEY: chave criada no painel do Resend (variável secreta no Netlify).
 * - EMAIL_FROM (opcional): remetente; padrão "Birion Finance <noreply@birion.com.br>".
 * Sem a chave, no computador (desenvolvimento) o e-mail só aparece no terminal, para testar.
 */
export type Email = { to: string; subject: string; html: string; text: string };

const FROM = process.env.EMAIL_FROM || "Birion Finance <noreply@birion.com.br>";

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/** Envia o e-mail. Devolve null se deu certo, ou o motivo da falha (para mostrar a quem tentou). */
export async function sendEmail(mail: Email): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[e-mail de teste] para ${mail.to} · ${mail.subject}\n${mail.text}`);
      return null;
    }
    console.error("RESEND_API_KEY não configurada: e-mail não enviado.");
    return "a chave do Resend (RESEND_API_KEY) não está configurada no site";
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (r.ok) return null;
    const body = (await r.text()).slice(0, 300);
    console.error("Resend recusou o e-mail", r.status, body);
    let msg = body;
    try {
      msg = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {}
    return `o Resend respondeu ${r.status}: ${msg}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Falha ao enviar e-mail", msg);
    return `não conectou ao Resend (${msg})`;
  }
}

/** Escapa texto para colocar no HTML do e-mail. */
export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Moldura dos e-mails do Birion: logo em texto, conteúdo e rodapé. Cores da marca. */
export function emailLayout(title: string, body: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#eef6f8;font-family:Arial,Helvetica,sans-serif;color:#0f1d38">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0f1d38;padding:18px 24px;font-size:20px;font-weight:700;color:#ffffff">Birion <span style="color:#1ac4db">Finance</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:20px;color:#0f1d38">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:14px 24px;background:#f6fafc;font-size:12px;color:#64748b">Este e-mail foi enviado automaticamente pelo Birion Finance. Não precisa responder.</td></tr>
</table></td></tr></table></body></html>`;
}
