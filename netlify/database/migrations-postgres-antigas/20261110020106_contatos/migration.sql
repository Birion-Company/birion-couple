ALTER TABLE "invites" ADD COLUMN "participantId" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_participantId_participants_id_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Pessoas avulsas viram contatos comuns (quem não tem login). Ficam como estavam: ativas ou escondidas.
UPDATE "participants" SET "temporary" = false WHERE "temporary" = true;
