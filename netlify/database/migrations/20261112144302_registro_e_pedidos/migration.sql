CREATE TABLE "family_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"actorUserId" uuid,
	"actorName" text NOT NULL,
	"subjectUserId" uuid,
	"action" text NOT NULL,
	"text" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"requestedBy" uuid NOT NULL,
	"forName" text NOT NULL,
	"contactId" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviteId" uuid,
	"reason" text,
	"decidedBy" uuid,
	"decidedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "family_log_household_created_idx" ON "family_log" ("householdId","createdAt");--> statement-breakpoint
CREATE INDEX "invite_requests_household_idx" ON "invite_requests" ("householdId");--> statement-breakpoint
ALTER TABLE "family_log" ADD CONSTRAINT "family_log_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "family_log" ADD CONSTRAINT "family_log_actorUserId_users_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "family_log" ADD CONSTRAINT "family_log_subjectUserId_users_id_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_requestedBy_users_id_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_contactId_participants_id_fkey" FOREIGN KEY ("contactId") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_inviteId_invites_id_fkey" FOREIGN KEY ("inviteId") REFERENCES "invites"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_decidedBy_users_id_fkey" FOREIGN KEY ("decidedBy") REFERENCES "users"("id") ON DELETE SET NULL;