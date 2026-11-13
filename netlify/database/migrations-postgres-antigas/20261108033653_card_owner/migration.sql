ALTER TABLE "credit_cards" ADD COLUMN "ownerId" uuid;--> statement-breakpoint
CREATE INDEX "credit_cards_owner_idx" ON "credit_cards" ("ownerId");--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_ownerId_participants_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Cartões criados antes de terem dono ficam com a pessoa de quem administra a família.
UPDATE "credit_cards" c SET "ownerId" = (
  SELECT m."participantId" FROM "memberships" m
  WHERE m."householdId" = c."householdId" AND m."role" = 'owner' AND m."participantId" IS NOT NULL
  ORDER BY m."createdAt" LIMIT 1
) WHERE c."ownerId" IS NULL;
