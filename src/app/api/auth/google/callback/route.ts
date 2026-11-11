import { NO_HOUSEHOLD } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { exchangeCode, GOOGLE_COOKIE, publicOrigin } from "@/lib/google";
import { defaultHouseholdName } from "@/lib/defaults";
import { createHouseholdForUser } from "@/lib/household";
import { createSession } from "@/lib/session";

/** Volta do Google: entra na conta com o mesmo e-mail ou cria uma família nova. */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.nextUrl.origin);
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/entrar?erro=${code}`, origin));
    res.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
    return res;
  };
  const params = request.nextUrl.searchParams;
  const [state, verifier, convite] = (request.cookies.get(GOOGLE_COOKIE)?.value ?? "").split(".");
  const code = params.get("code");
  if (params.get("error")) return fail("google-cancelado");
  if (!code || !state || !verifier || params.get("state") !== state) return fail("google-falhou");

  let profile;
  try {
    profile = await exchangeCode(code, verifier, origin);
  } catch {
    return fail("google-falhou");
  }

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, profile.email)).limit(1);
  let uid: string;
  let hid: string;
  let welcome = false;
  if (user) {
    const [m] = await db
      .select({ hid: schema.memberships.householdId })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id))
      .orderBy(schema.memberships.createdAt)
      .limit(1);
    uid = user.id;
    // Sem família (a dela foi apagada): entra, mas só pode criar uma família nova.
    hid = m?.hid ?? NO_HOUSEHOLD;
  } else {
    // Conta nova: senha aleatória (só entra pelo Google até definir outra) e família própria.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
    const ids = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({ email: profile.email, name: profile.name, passwordHash })
        .returning({ id: schema.users.id });
      const h = await createHouseholdForUser(tx, { userId: u.id, userName: profile.name, householdName: defaultHouseholdName(profile.name) });
      return { uid: u.id, hid: h };
    });
    uid = ids.uid;
    hid = ids.hid;
    // Conta nova pelo Google: primeiro pergunta como quer ser chamada (tela de boas-vindas).
    welcome = true;
  }
  await createSession({ uid, hid });
  // Veio de um convite: conta nova confirma o nome primeiro; depois (ou se já tinha conta) aceita a família.
  const invite = convite && /^[A-Za-z0-9_-]{6,80}$/.test(convite) ? convite : "";
  const next = welcome ? (invite ? `/boas-vindas?convite=${invite}` : "/boas-vindas") : invite ? `/convite/${invite}` : hid === NO_HOUSEHOLD ? "/nova-familia" : "/painel";
  const res = NextResponse.redirect(new URL(next, origin));
  res.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
  return res;
}
