CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"codeHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" ("userId");--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;