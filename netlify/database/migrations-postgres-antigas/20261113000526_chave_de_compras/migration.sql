CREATE TABLE "purchase_keys" (
	"userId" uuid PRIMARY KEY,
	"keyHash" text NOT NULL UNIQUE,
	"prefix" text NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_keys" ADD CONSTRAINT "purchase_keys_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;