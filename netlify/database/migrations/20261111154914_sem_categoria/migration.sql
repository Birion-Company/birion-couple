ALTER TABLE "recurring_series" ADD COLUMN "noCategory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "noCategory" boolean DEFAULT false NOT NULL;