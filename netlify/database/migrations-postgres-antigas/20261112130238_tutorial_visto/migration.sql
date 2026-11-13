ALTER TABLE "users" ADD COLUMN "tourSeenAt" timestamp with time zone;--> statement-breakpoint
-- Quem já usava o app antes disso não vê o tutorial de novo.
UPDATE "users" SET "tourSeenAt" = now();
