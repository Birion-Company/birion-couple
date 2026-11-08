CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"description" text NOT NULL,
	"amountCents" integer NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"payerId" uuid,
	"categoryId" uuid,
	"projectId" uuid,
	"statusId" uuid,
	"cardId" uuid,
	"notes" text,
	"splits" jsonb NOT NULL,
	"startDate" date NOT NULL,
	"nextIndex" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "recurring_series_household_idx" ON "recurring_series" ("householdId");--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_payerId_participants_id_fkey" FOREIGN KEY ("payerId") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_categoryId_categories_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_projectId_projects_id_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_statusId_statuses_id_fkey" FOREIGN KEY ("statusId") REFERENCES "statuses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_cardId_credit_cards_id_fkey" FOREIGN KEY ("cardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL;