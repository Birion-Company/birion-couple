ALTER TABLE "password_resets" ADD COLUMN "purpose" text DEFAULT 'reset' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "emailVerifiedAt" = now();
