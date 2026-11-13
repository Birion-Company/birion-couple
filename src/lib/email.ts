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
    // No computador (desenvolvimento, ou produção local com LOCAL_HTTP=1) sem chave: o e-mail aparece no log.
    if (process.env.NODE_ENV !== "production" || process.env.LOCAL_HTTP === "1") {
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

/** Endereço público do site (as imagens do e-mail precisam de endereço completo). */
const SITE = process.env.SITE_URL || "https://birion.com.br";

/** Caixa com o código de 4 números, para os e-mails de confirmação. */
export function codeBox(code: string) {
  return `<p style="margin:0 0 32px;text-align:center"><span class="dark-box" style="display:inline-block;padding:16px 14px 16px 28px;border-radius:12px;background:#f1f1ef;color:#1d1d1b;font:bold 40px/44px Arial,sans-serif;letter-spacing:14px">${esc(code)}</span></p>`;
}

/** Botão preto de canto arredondado (no jeito dos e-mails da Kaspersky). */
export function emailButton(label: string, href: string) {
  return `<table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:#1d1d1b;padding:13px 28px;text-align:center"><a href="${esc(href)}" style="font:18px/24px Arial,sans-serif;color:#ffffff;text-decoration:none;display:block">${esc(label)}</a></td></tr></table>`;
}

/**
 * Moldura dos e-mails do Birion, inspirada nos e-mails da Kaspersky: fundo claro, logo no topo, uma etiqueta
 * pequena com bolinha colorida, título grande, texto curto, rodapé cinza. Tem versão escura (logo branco).
 * `eyebrow` é a etiqueta de cima; `preheader` é o texto de prévia que aparece na caixa de entrada.
 */
export function emailLayout(title: string, body: string, opts: { eyebrow?: string; preheader?: string } = {}) {
  const eyebrow = opts.eyebrow ?? "Birion Finance";
  const pre = opts.preheader ?? title;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title>
<style>
@media screen and (max-width:599.98px){.px-5{padding-left:6% !important;padding-right:6% !important}.h1{font-size:32px !important;line-height:36px !important}}
@media (prefers-color-scheme:dark){.dark-bg-email{background-color:#12100f !important}.dark-bg-white{background-color:#000 !important}.dark-bg-footer{background-color:#1b1918 !important}.dark-text{color:#fff !important}.dark-box{background-color:#1b1918 !important;color:#fff !important}.dark-img{display:block !important}.light-img{display:none !important}}
</style></head>
<body class="dark-bg-email" style="margin:0;padding:0;background:#EDEFF0">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<center class="dark-bg-email" style="width:100%;background:#EDEFF0"><div style="max-width:600px;margin:0 auto">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr><td align="center" class="px-5 dark-bg-white" style="background:#ffffff;padding:32px 72px 48px">
<a href="${SITE}" target="_blank"><img class="light-img" src="${SITE}/brand/email-logo.png" width="150" alt="Birion" style="display:block;border:0;height:auto"><img class="dark-img" src="${SITE}/brand/email-logo-white.png" width="150" alt="Birion" style="display:none;border:0;height:auto"></a>
<div style="height:28px;line-height:28px" aria-hidden="true">&nbsp;</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-right:12px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#e07a5f"></span></td><td><p class="dark-text" style="margin:0;font:bold 15px/16px Arial,sans-serif;letter-spacing:0.16em;text-transform:uppercase;color:#1d1d1b">${esc(eyebrow)}</p></td></tr></table>
<h1 class="h1 dark-text" style="margin:28px 0 28px;font:bold 40px/44px Arial,sans-serif;letter-spacing:-0.01em;color:#1d1d1b;text-align:center">${esc(title)}</h1>
<div class="dark-text" style="font:18px/26px Arial,sans-serif;color:#1d1d1b;text-align:center">${body}</div>
</td></tr>
<tr><td class="dark-bg-footer" style="background:#e4e6e7;padding:24px 32px 28px;text-align:center">
<p style="margin:0 0 6px;font:14px/20px Arial,sans-serif;color:#1d1d1b"><a class="dark-text" href="${SITE}" style="color:#1d1d1b;text-decoration:none">birion.com.br</a></p>
<p style="margin:0;font:11px/15px Arial,sans-serif;color:#8e8e8e">Este e-mail foi enviado automaticamente pelo Birion Finance. Não precisa responder.</p>
</td></tr></table></div></center></body></html>`;
}
