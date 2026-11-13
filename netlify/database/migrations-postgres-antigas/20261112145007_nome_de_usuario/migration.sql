ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
-- Contas que já existiam: @ a partir do nome (sem acento), com números no fim se repetir.
UPDATE "users" u SET "username" = x.v FROM (
  SELECT id, left(b, 16) || CASE WHEN row_number() OVER (PARTITION BY left(b, 16) ORDER BY "createdAt") = 1 THEN '' ELSE (row_number() OVER (PARTITION BY left(b, 16) ORDER BY "createdAt"))::text END AS v
  FROM (
    SELECT id, "createdAt",
      coalesce(nullif(trim(both '.' from regexp_replace(lower(translate(name, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '.', 'g')), ''), 'pessoa') AS b
    FROM "users"
  ) y
) x WHERE x.id = u.id AND u."username" IS NULL;
--> statement-breakpoint
UPDATE "users" SET "username" = 'pessoa' || substr(replace(id::text, '-', ''), 1, 6) WHERE length("username") < 3;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" (lower("username"));
