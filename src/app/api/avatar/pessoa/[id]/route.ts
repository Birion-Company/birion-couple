import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { getAuth } from "@/lib/auth";

/** Foto de um contato (sem login). Só o dono do contato vê. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/avatar/pessoa/[id]">) {
  const auth = await getAuth();
  if (!auth) return new NextResponse(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const [p] = await getDb()
    .select({ data: schema.participants.photoData })
    .from(schema.participants)
    .where(and(eq(schema.participants.id, id), eq(schema.participants.householdId, auth.householdId), eq(schema.participants.ownerUserId, auth.userId)))
    .limit(1);
  if (!p?.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(p.data, "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
