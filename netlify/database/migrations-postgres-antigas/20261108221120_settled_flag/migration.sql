ALTER TABLE "transactions" ADD COLUMN "settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- O que já estava com um status de comportamento "acertado" continua acertado.
UPDATE "transactions" SET "settled" = true
FROM "statuses"
WHERE "transactions"."statusId" = "statuses"."id" AND "statuses"."behavior" = 'settled';
