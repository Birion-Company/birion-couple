import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_COOKIE, googleConfig, newPkce, publicOrigin, redirectUri } from "@/lib/google";

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.nextUrl.origin);
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/entrar?erro=google-indisponivel", origin));
  const { verifier, challenge, state } = newPkce();
  // Veio de um convite: depois do Google, volta para aceitar a família.
  const convite = request.nextUrl.searchParams.get("convite") ?? "";
  const invite = /^[A-Za-z0-9_-]{6,80}$/.test(convite) ? convite : "";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_COOKIE, `${state}.${verifier}.${invite}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
