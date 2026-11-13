ALTER TABLE "participants" ADD COLUMN "ownerUserId" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_ownerUserId_users_id_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Contatos que já existiam: ficam com quem mais lançou com eles; sem nenhum lançamento, com quem administra.
UPDATE "participants" p SET "ownerUserId" = coalesce(
  (SELECT t."createdBy" FROM "transactions" t
     JOIN "memberships" m ON m."userId" = t."createdBy" AND m."householdId" = p."householdId"
    WHERE t."householdId" = p."householdId"
      AND (t."payerId" = p."id" OR EXISTS (SELECT 1 FROM "transaction_splits" s WHERE s."transactionId" = t."id" AND s."participantId" = p."id"))
    GROUP BY t."createdBy" ORDER BY count(*) DESC LIMIT 1),
  (SELECT m."userId" FROM "memberships" m WHERE m."householdId" = p."householdId" AND m."role" = 'owner' ORDER BY m."createdAt" LIMIT 1)
)
WHERE NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."participantId" = p."id");
