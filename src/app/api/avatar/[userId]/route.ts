import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { getAuth } from "@/lib/auth";

/** Foto de perfil. Só quem está logado e participa de uma mesma família pode ver. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/avatar/[userId]">) {
  const auth = await getAuth();
  if (!auth) return new NextResponse(null, { status: 401 });
  const { userId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new NextResponse(null, { status: 404 });
  const db = getDb();
  if (userId !== auth.userId) {
    const mine = db.select({ h: schema.memberships.householdId }).from(schema.memberships).where(eq(schema.memberships.userId, auth.userId));
    const [shared] = await db
      .select({ u: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, userId), inArray(schema.memberships.householdId, mine)))
      .limit(1);
    if (!shared) return new NextResponse(null, { status: 404 });
  }
  const [user] = await db.select({ data: schema.users.avatarData }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(user.data, "base64"), {
    headers: {
      "content-type": "image/jpeg",
      // A URL leva ?v=<data da troca>, então pode ficar em cache; é privada por depender do login.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
