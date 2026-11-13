-- Convite vale no máximo 1 dia: os que foram criados com prazo maior (7 dias) passam a vencer 1 dia depois de criados.
UPDATE "invites" SET "expiresAt" = least("expiresAt", "createdAt" + interval '1 day') WHERE "usedAt" IS NULL;
