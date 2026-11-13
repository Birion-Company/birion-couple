CREATE TABLE "auto_accept_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"participantId" uuid NOT NULL,
	"fromParticipantId" uuid NOT NULL,
	"maxCents" integer,
	"match" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auto_accept_rules_household_idx" ON "auto_accept_rules" ("householdId");--> statement-breakpoint
ALTER TABLE "auto_accept_rules" ADD CONSTRAINT "auto_accept_rules_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auto_accept_rules" ADD CONSTRAINT "auto_accept_rules_participantId_participants_id_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auto_accept_rules" ADD CONSTRAINT "auto_accept_rules_fromParticipantId_participants_id_fkey" FOREIGN KEY ("fromParticipantId") REFERENCES "participants"("id") ON DELETE CASCADE;