import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Uma família (ou grupo) que compartilha as finanças. Todos os dados pertencem a uma. */
export const households = pgTable("households", {
  id: id(),
  name: text().notNull(),
  currency: text().notNull().default("BRL"),
  locale: text().notNull().default("pt-BR"),
  createdAt: createdAt(),
});

/** Pessoa que entra no sistema (tem e-mail e senha). */
export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  /** Foto de perfil já reduzida (JPEG ~320px) em base64; nula quando não há foto. */
  avatarData: text(),
  avatarUpdatedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().notNull().default("member"), // owner | member
    participantId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const invites = pgTable("invites", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  code: text().notNull().unique(),
  role: text().notNull().default("member"),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** Pessoas que participam das despesas (não precisam ter login). */
export const participants = pgTable(
  "participants",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text().notNull().default("#1AC4DB"),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("participants_household_idx").on(t.householdId)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text().notNull().default("#94A3B8"),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("categories_household_idx").on(t.householdId)],
);

/** Regras de categorização automática na importação: se a descrição contém o texto, usa a categoria. */
export const categoryRules = pgTable(
  "category_rules",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    pattern: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("category_rules_household_idx").on(t.householdId)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    color: text().notNull().default("#6366F1"),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("projects_household_idx").on(t.householdId)],
);

/**
 * Status configuráveis. O "behavior" diz o que o status significa para os saldos:
 * - pending: ainda não foi pago; aparece em Pendências e não entra no saldo.
 * - open: alguém pagou e os outros ainda devem; entra no saldo.
 * - settled: já foi acertado (reembolsado); não entra no saldo.
 */
export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text().notNull().default("#94A3B8"),
    behavior: text().notNull().default("pending"),
    isDefault: boolean().notNull().default(false),
    isImportDefault: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("statuses_household_idx").on(t.householdId)],
);

/** Cartões de crédito da família, com o dia em que a fatura fecha e o dia em que vence. */
export const creditCards = pgTable(
  "credit_cards",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    color: text().notNull().default("#1AC4DB"),
    /** Dia do mês em que a fatura fecha (1–31; em meses curtos vale o último dia). */
    closingDay: integer().notNull(),
    /** Dia do mês em que a fatura vence (1–31). Se for menor ou igual ao fechamento, vence no mês seguinte. */
    dueDay: integer().notNull(),
    /** Quantos dias antes avisar do fechamento e do vencimento; nulo = não avisar. */
    alertDays: integer().default(3),
    /** Quem paga a fatura; vira o "quem pagou" padrão das compras no cartão. */
    holderId: uuid().references(() => participants.id, { onDelete: "set null" }),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("credit_cards_household_idx").on(t.householdId)],
);

export const importBatches = pgTable("import_batches", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  fileName: text().notNull(),
  format: text().notNull(), // ofx | csv
  imported: integer().notNull().default(0),
  skipped: integer().notNull().default(0),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Modelos salvos de leitura de CSV (qual coluna é data, valor etc.). */
export const csvPresets = pgTable("csv_presets", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text().notNull(),
  mapping: jsonb().notNull(),
  createdAt: createdAt(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    description: text().notNull(),
    /** Valor em centavos, sempre positivo. O sentido vem do "kind". */
    amountCents: integer().notNull(),
    kind: text().notNull().default("expense"), // expense | income | transfer
    payerId: uuid().references(() => participants.id, { onDelete: "set null" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    statusId: uuid().references(() => statuses.id, { onDelete: "set null" }),
    /** Cartão de crédito usado; a fatura sai da data e do dia de fechamento do cartão. */
    cardId: uuid().references(() => creditCards.id, { onDelete: "set null" }),
    /** Compras parceladas ou recorrentes: todas as parcelas compartilham o mesmo seriesId. */
    seriesId: uuid(),
    seriesKind: text(), // installment | monthly
    seriesIndex: integer(), // 1, 2, 3…
    seriesTotal: integer(),
    notes: text(),
    source: text().notNull().default("manual"), // manual | ofx | csv
    externalId: text(),
    importBatchId: uuid().references(() => importBatches.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    index("transactions_household_date_idx").on(t.householdId, t.date),
    uniqueIndex("transactions_household_external_idx").on(t.householdId, t.externalId),
    index("transactions_card_date_idx").on(t.cardId, t.date),
    index("transactions_series_idx").on(t.seriesId),
  ],
);

/** Quanto cabe a cada participante numa transação. A soma é igual ao valor da transação. */
export const transactionSplits = pgTable(
  "transaction_splits",
  {
    transactionId: uuid()
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    amountCents: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.participantId] }),
    index("splits_participant_idx").on(t.participantId),
  ],
);
