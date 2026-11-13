import {
  type AnyPgColumn,
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
  /**
   * Desde quando lançamentos que envolvem outro membro precisam ser aceitos por ele.
   * Os anteriores (de antes de existir a confirmação) valem como já aceitos.
   */
  approvalsFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /**
   * Última manutenção automática (meses das contas fixas, parcelas, categorias, contatos parados) e a
   * última atividade que ela já tinha visto: guardado aqui para valer em todos os servidores.
   */
  maintainedAt: timestamp({ withTimezone: true }),
  maintainedActivityAt: timestamp({ withTimezone: true }),
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
  /** Quais notificações push a pessoa quer receber ({ divida: false, … }); sem a chave = ligada. */
  pushPrefs: jsonb().notNull().default({}),
  avatarUpdatedAt: timestamp({ withTimezone: true }),
  /** Conta de auditoria do BIRION: só lê, vê todas as famílias e não pertence a nenhuma. */
  isAuditor: boolean().notNull().default(false),
  /** Quando a pessoa viu (ou pulou) o tutorial: ele só abre sozinho no primeiro acesso, em qualquer aparelho. */
  tourSeenAt: timestamp({ withTimezone: true }),
  /** Nome de usuário (@fulano): único no Birion (sem diferença de maiúsculas). */
  username: text(),
  /** Quando o e-mail foi confirmado (código de 4 números, ou login pelo Google). Sem isso, não entra no app. */
  emailVerifiedAt: timestamp({ withTimezone: true }),
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
    /** Até quando a pessoa já viu o popup de alterações; quem entra agora não recebe o histórico antigo. */
    activitySeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

/**
 * Apelidos: cada conta pode dar um apelido às pessoas com login da família, só para ela mesma.
 * Ex.: dois "Felipe" — para você um vira "Felipe (irmão)". Os outros continuam vendo o nome cadastrado.
 */
export const nicknames = pgTable(
  "nicknames",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    nickname: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.participantId] })],
);

export const invites = pgTable("invites", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  code: text().notNull().unique(),
  /** Nome do convite para reconhecer na lista (ex.: "Convite mãe"). */
  label: text(),
  role: text().notNull().default("member"),
  /** Convite feito a partir de um contato: ao aceitar, a conta fica ligada a essa pessoa (com o histórico dela). */
  participantId: uuid().references(() => participants.id, { onDelete: "set null" }),
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
    /**
     * Contato (sem login) é de uma conta só: só ela vê o nome, usa nas listas e edita. Para os outros
     * aparece "Contato de Fulano". Pessoa com login não tem dono (é da família toda).
     */
    ownerUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    /**
     * Antigo "pessoa avulsa". Não é mais usado: quem não tem login é um contato (lib/contacts.ts),
     * com limite de ativos e escondido sozinho quando fica parado. Fica no banco só por compatibilidade.
     */
    temporary: boolean().notNull().default(false),
    /** Foto de quem não tem login (JPEG ~320px em base64). Quem tem login usa a foto do próprio perfil. */
    photoData: text(),
    photoUpdatedAt: timestamp({ withTimezone: true }),
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
    /** Ícone da categoria (chave de lib/category-icons, ex.: "cart", "home"). */
    icon: text().notNull().default("tag"),
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
 * - pending: ainda não foi pago; aparece em Pendentes e não entra no saldo.
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
    /** Dono do cartão (pessoa). Cada pessoa tem os próprios cartões, independentes dos outros. */
    ownerId: uuid().references(() => participants.id, { onDelete: "cascade" }),
    /** Dia do mês em que a fatura fecha (1–31; em meses curtos vale o último dia). */
    closingDay: integer().notNull(),
    /** Dia do mês em que a fatura vence (1–31). Se for menor ou igual ao fechamento, vence no mês seguinte. */
    dueDay: integer().notNull(),
    /** Quantos dias antes avisar do fechamento e do vencimento; nulo = não avisar. */
    alertDays: integer().default(3),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("credit_cards_household_idx").on(t.householdId), index("credit_cards_owner_idx").on(t.ownerId)],
);

/**
 * Lançamento que se repete todo mês sem data para acabar. Guarda o modelo; o lançamento de cada
 * mês é criado quando o mês chega (até o fim do mês corrente), e todos têm seriesId = id daqui.
 */
export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    description: text().notNull(),
    amountCents: integer().notNull(),
    kind: text().notNull().default("expense"),
    payerId: uuid().references(() => participants.id, { onDelete: "set null" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    statusId: uuid().references(() => statuses.id, { onDelete: "set null" }),
    cardId: uuid().references(() => creditCards.id, { onDelete: "set null" }),
    notes: text(),
    /** Os meses criados saem sem categoria de propósito (não vão para "A identificar"). */
    noCategory: boolean().notNull().default(false),
    /** [{ participantId, amountCents }] de cada mês. */
    splits: jsonb().notNull(),
    /** Data do primeiro lançamento; os seguintes caem no mesmo dia dos meses seguintes. */
    startDate: date({ mode: "string" }).notNull(),
    /** Número do próximo lançamento a criar (1 = o primeiro). */
    nextIndex: integer().notNull().default(1),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("recurring_series_household_idx").on(t.householdId)],
);

/**
 * O que cada pessoa fez nos lançamentos (criou, alterou, excluiu, importou…).
 * Vira o popup "o que mudou" para quem está envolvido (audience = ids de pessoas) e para o admin.
 */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(), // created | updated | deleted | status | bulk | series | imported | import_deleted | stopped
    /** Lançamento afetado (sem chave estrangeira: continua aqui depois de excluído). */
    transactionId: uuid(),
    /** Resumo para montar a frase: descrição, valor, tipo, quem pagou, divisão, mudanças… */
    data: jsonb().notNull(),
    /** Pessoas envolvidas (ids de participantes) que devem ver o aviso. */
    audience: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activities_household_created_idx").on(t.householdId, t.createdAt)],
);

/**
 * Registro da família (não é notificação): quem entrou, saiu, virou administrador, convites, pedidos
 * de convite, mudança de nome… Quem administra vê tudo; cada membro vê o que fez ou o que foi com ele.
 */
export const familyLog = pgTable(
  "family_log",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Nome de quem fez, guardado (continua legível se a conta for apagada). */
    actorName: text().notNull(),
    /** Conta afetada (ex.: quem virou administrador), para o membro ver o que foi com ele. */
    subjectUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    /** Frase pronta para ler. */
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("family_log_household_created_idx").on(t.householdId, t.createdAt)],
);

/**
 * Pedido de convite: um membro pede para chamar alguém; quem administra aceita (gera o link, que
 * aparece para quem pediu) ou recusa.
 */
export const inviteRequests = pgTable(
  "invite_requests",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    requestedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Para quem é o convite (nome ou observação de quem pediu). */
    forName: text().notNull(),
    /** Contato de quem pediu que vai virar a pessoa com login (com o histórico dele). */
    contactId: uuid().references(() => participants.id, { onDelete: "set null" }),
    status: text().notNull().default("pending"), // pending | approved | declined
    inviteId: uuid().references(() => invites.id, { onDelete: "set null" }),
    reason: text(),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invite_requests_household_idx").on(t.householdId)],
);

/** Senhas erradas no login (por e-mail): depois de 5 em 15 minutos, o login espera. */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: id(),
    email: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_failures_email_idx").on(t.email, t.createdAt)],
);

/**
 * Orçamento: limite mensal por categoria, de cada pessoa (só a parte dela nos gastos conta).
 * alertedMonth/alertedLevel guardam o último aviso (80 ou 100) do mês, para não avisar de novo.
 */
export const budgets = pgTable(
  "budgets",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    monthlyCents: integer().notNull(),
    alertedMonth: text(),
    alertedLevel: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

/** Metas de economia: de cada pessoa. targetMonth é "AAAA-MM"; savedCents é quanto já foi guardado. */
export const goals = pgTable("goals", {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  targetCents: integer().notNull(),
  savedCents: integer().notNull().default(0),
  targetMonth: text().notNull(),
  createdAt: createdAt(),
});

/** Contas (banco, carteira, poupança) de cada pessoa, com o saldo que ela informa. Entram na "posição" junto com cartões e dívidas. */
export const accounts = pgTable("accounts", {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  balanceCents: integer().notNull().default(0),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

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
    /** Antigo status escolhido à mão. Não é mais usado: o status agora é calculado (ver lib/tx-state.ts). */
    statusId: uuid().references(() => statuses.id, { onDelete: "set null" }),
    /** Marcado como "Já acertado": sai das dívidas. É a única parte do status escolhida à mão. */
    settled: boolean().notNull().default(false),
    /** Compra no cartão: a fatura em que ela entrou já foi paga. */
    invoicePaid: boolean().notNull().default(false),
    /** Receita que ainda não caiu na conta ("A receber"): só conta depois que a pessoa confirma "Recebi". */
    awaitingReceipt: boolean().notNull().default(false),
    /** Despesa que não precisa de categoria (ex.: algo pago por alguém): não vai para "A identificar". */
    noCategory: boolean().notNull().default(false),
    /**
     * Acerto que paga uma dívida de outro lançamento (ex.: Fulano pagando a parte dele).
     * Se o valor for maior que o devido, a sobra fica com quem recebeu (ou vira um adiantamento à parte).
     */
    settlesId: uuid().references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
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
    /** Acerto que pagou esta parte (a dívida desta pessoa neste lançamento acabou). */
    paidById: uuid().references(() => transactions.id, { onDelete: "set null" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.participantId] }),
    index("splits_participant_idx").on(t.participantId),
  ],
);

/** Aparelhos que aceitaram notificações push (iPhone pela Tela de Início, Android, computador). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** "iPhone", "Android", "Computador": só para mostrar onde está ligado. */
    device: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint), index("push_user_idx").on(t.userId)],
);

/** Avisos agendados já enviados (ex.: "fatura vence amanhã"), para não mandar o mesmo duas vezes. */
export const pushSent = pgTable(
  "push_sent",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/**
 * Confirmação de um membro sobre um lançamento que outra pessoa colocou no nome dele
 * ("Para confirmar"). Enquanto ele não aceita, o lançamento não mexe nas dívidas.
 * key = seriesId (parcelas e meses valem juntos) ou o id do lançamento.
 * fingerprint = o que foi aceito (tipo, valor, quem pagou, divisão): se mudar, pede de novo.
 */
export const txApprovals = pgTable(
  "tx_approvals",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: uuid().notNull(),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    status: text().notNull(), // accepted | refused
    fingerprint: text().notNull(),
    reason: text(),
    decidedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.key, t.participantId] }), index("tx_approvals_household_idx").on(t.householdId)],
);

/**
 * "Esqueci minha senha": código de 4 dígitos mandado por e-mail. Só o hash do código fica guardado;
 * vale 15 minutos, aceita poucas tentativas e serve uma vez só.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "reset" (esqueci a senha) ou "verify" (confirmar o e-mail ao criar a conta). */
    purpose: text().notNull().default("reset"),
    codeHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);
