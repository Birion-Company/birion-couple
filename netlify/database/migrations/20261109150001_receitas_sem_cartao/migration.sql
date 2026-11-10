-- Receita não tem cartão: o dinheiro que entra é de quem recebeu, não de um cartão.
-- (Receita lançada no cartão era tratada como estorno e abatia a fatura.)
UPDATE "transactions" SET "cardId" = NULL, "invoicePaid" = false WHERE "kind" = 'income' AND "cardId" IS NOT NULL;--> statement-breakpoint
UPDATE "recurring_series" SET "cardId" = NULL WHERE "kind" = 'income' AND "cardId" IS NOT NULL;
