ALTER TABLE "transaction_splits" ADD COLUMN "paidById" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "invoicePaid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "settlesId" uuid;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_paidById_transactions_id_fkey" FOREIGN KEY ("paidById") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settlesId_transactions_id_fkey" FOREIGN KEY ("settlesId") REFERENCES "transactions"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Compras de cartão com mais de 2 meses: a fatura delas já venceu, então já foi paga.
UPDATE "transactions" SET "invoicePaid" = true WHERE "cardId" IS NOT NULL AND "date" < current_date - 62;
