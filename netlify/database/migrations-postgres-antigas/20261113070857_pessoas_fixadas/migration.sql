ALTER TABLE "participants" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cleanPeople" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Quem já estava guardado começa a contar os dias a partir de hoje.
UPDATE "participants" SET "archivedAt" = now() WHERE "archived" = true AND "archivedAt" IS NULL;
