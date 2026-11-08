ALTER TABLE "categories" ADD COLUMN "icon" text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
-- Ícone das categorias que já existem, pelo nome (sem acentos).
UPDATE "categories" SET "icon" = CASE
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(mercado|supermerc|feira)' THEN 'cart'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(moradia|casa|aluguel|condominio)' THEN 'home'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(transporte|uber|taxi|carro)' THEN 'car'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(saude|medic|consulta|hospital)' THEN 'health'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(remedio|farmacia)' THEN 'pill'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(lazer|diversao|festa)' THEN 'party'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(educa|escola|faculdade|curso)' THEN 'education'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(assinatura|streaming)' THEN 'tv'
  WHEN translate(lower("name"), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(restaurante|comida|delivery|lanche)' THEN 'food'
  ELSE 'tag'
END;
