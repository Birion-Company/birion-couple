import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

it("monta o e-mail no novo estilo", async () => {
  const { codeBox, emailLayout } = await import("@/lib/email");
  const html = emailLayout("Seu código de acesso", `<p style="margin:0 0 28px">Olá, Ana! Use este código para terminar de criar sua conta:</p>${codeBox("4827")}<p style="margin:0;font-size:14px;color:#6b6b68">Vale por 15 minutos.</p>`, { eyebrow: "Confirme seu e-mail", preheader: "Seu código: 4827" });
  expect(html).toContain("4827");
  expect(html).toContain("email-logo.png");
  if (process.env.EMAIL_PREVIEW) writeFileSync(process.env.EMAIL_PREVIEW, html);
});
