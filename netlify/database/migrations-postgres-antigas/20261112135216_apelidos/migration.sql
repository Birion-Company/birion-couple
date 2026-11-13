CREATE TABLE "nicknames" (
	"userId" uuid,
	"participantId" uuid,
	"nickname" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nicknames_pkey" PRIMARY KEY("userId","participantId")
);
--> statement-breakpoint
ALTER TABLE "nicknames" ADD CONSTRAINT "nicknames_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nicknames" ADD CONSTRAINT "nicknames_participantId_participants_id_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE;