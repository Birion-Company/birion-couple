CREATE TABLE "tx_approvals" (
	"householdId" uuid NOT NULL,
	"key" uuid,
	"participantId" uuid,
	"status" text NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" text,
	"decidedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tx_approvals_pkey" PRIMARY KEY("key","participantId")
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "approvalsFrom" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "tx_approvals_household_idx" ON "tx_approvals" ("householdId");--> statement-breakpoint
ALTER TABLE "tx_approvals" ADD CONSTRAINT "tx_approvals_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tx_approvals" ADD CONSTRAINT "tx_approvals_participantId_participants_id_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE;