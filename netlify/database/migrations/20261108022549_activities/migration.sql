CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"actorUserId" uuid,
	"action" text NOT NULL,
	"transactionId" uuid,
	"data" jsonb NOT NULL,
	"audience" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "activitySeenAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_household_created_idx" ON "activities" ("householdId","createdAt");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorUserId_users_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL;