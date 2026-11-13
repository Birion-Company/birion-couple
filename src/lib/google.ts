import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Login com Google (OAuth 2.0 + PKCE). Fica ativo quando as duas variáveis existem. */
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const GOOGLE_COOKIE = "bf_google";

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

/**
 * Endereço público do site para o login com Google. No Netlify, o pedido chega com o endereço interno
 * do deploy (abc123--birion-finance.netlify.app); o certo é o domínio principal (URL = https://couple.birion.com.br),
 * que é o que está autorizado no Google.
 */
export function publicOrigin(requestOrigin: string) {
  const site = process.env.URL;
  return process.env.NODE_ENV === "production" && site ? site.replace(/\/$/, "") : requestOrigin;
}

export function redirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleProfile = { email: string; name: string };

/** Troca o código pelo token e confere a assinatura e o público do id_token. */
export async function exchangeCode(code: string, verifier: string, origin: string): Promise<GoogleProfile> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("google-not-configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("google-token");
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("google-token");
  const { payload } = await jwtVerify(id_token, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: cfg.clientId,
  });
  if (typeof payload.email !== "string" || payload.email_verified !== true) throw new Error("google-email");
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.email.split("@")[0];
  return { email: payload.email.toLowerCase(), name: name.slice(0, 60) };
}
