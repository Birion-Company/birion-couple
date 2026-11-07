CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#94A3B8' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"pattern" text NOT NULL,
	"categoryId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"fileName" text NOT NULL,
	"format" text NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"code" text NOT NULL UNIQUE,
	"role" text DEFAULT 'member' NOT NULL,
	"createdBy" uuid,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"householdId" uuid,
	"userId" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	"participantId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("householdId","userId")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#1AC4DB' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366F1' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#94A3B8' NOT NULL,
	"behavior" text DEFAULT 'pending' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isImportDefault" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"transactionId" uuid,
	"participantId" uuid,
	"amountCents" integer NOT NULL,
	CONSTRAINT "transaction_splits_pkey" PRIMARY KEY("transactionId","participantId")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"householdId" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amountCents" integer NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"payerId" uuid,
	"categoryId" uuid,
	"projectId" uuid,
	"statusId" uuid,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"externalId" text,
	"importBatchId" uuid,
	"createdBy" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"passwordHash" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "categories" ("householdId");--> statement-breakpoint
CREATE INDEX "category_rules_household_idx" ON "category_rules" ("householdId");--> statement-breakpoint
CREATE INDEX "participants_household_idx" ON "participants" ("householdId");--> statement-breakpoint
CREATE INDEX "projects_household_idx" ON "projects" ("householdId");--> statement-breakpoint
CREATE INDEX "statuses_household_idx" ON "statuses" ("householdId");--> statement-breakpoint
CREATE INDEX "splits_participant_idx" ON "transaction_splits" ("participantId");--> statement-breakpoint
CREATE INDEX "transactions_household_date_idx" ON "transactions" ("householdId","date");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_household_external_idx" ON "transactions" ("householdId","externalId");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_categoryId_categories_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "csv_presets" ADD CONSTRAINT "csv_presets_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_transactions_id_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_participantId_participants_id_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_householdId_households_id_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payerId_participants_id_fkey" FOREIGN KEY ("payerId") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_categories_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_projectId_projects_id_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statusId_statuses_id_fkey" FOREIGN KEY ("statusId") REFERENCES "statuses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importBatchId_import_batches_id_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL;