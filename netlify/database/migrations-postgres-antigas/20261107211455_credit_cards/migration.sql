CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#1AC4DB' NOT NULL,
	"closingDay" integer NOT NULL,
	"dueDay" integer NOT NULL,
	"alertDays" integer DEFAULT 3,
	"holderId" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "cardId" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "seriesId" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "seriesKind" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "seriesIndex" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "seriesTotal" integer;--> statement-breakpoint
CREATE INDEX "credit_cards_household_idx" ON "credit_cards" ("householdId");--> statement-breakpoint
CREATE INDEX "transactions_card_date_idx" ON "transactions" ("cardId","date");--> statement-breakpoint
CREATE INDEX "transactions_series_idx" ON "transactions" ("seriesId");--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_holderId_participants_id_fkey" FOREIGN KEY ("holderId") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cardId_credit_cards_id_fkey" FOREIGN KEY ("cardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL;