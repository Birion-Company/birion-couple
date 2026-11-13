CREATE TABLE `accounts` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`balanceCents` int NOT NULL DEFAULT 0,
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `activities` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`actorUserId` varchar(36),
	`action` text NOT NULL,
	`transactionId` varchar(36),
	`data` json NOT NULL,
	`audience` json NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `auto_accept_rules` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`participantId` varchar(36) NOT NULL,
	`fromParticipantId` varchar(36) NOT NULL,
	`maxCents` int,
	`match` text,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`userId` varchar(36) NOT NULL,
	`categoryId` varchar(36) NOT NULL,
	`monthlyCents` int NOT NULL,
	`alertedMonth` text,
	`alertedLevel` int NOT NULL DEFAULT 0,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT PRIMARY KEY(`userId`,`categoryId`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT ('#94A3B8'),
	`icon` text NOT NULL DEFAULT ('tag'),
	`sortOrder` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`pattern` text NOT NULL,
	`categoryId` varchar(36) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT ('#1AC4DB'),
	`ownerId` varchar(36),
	`closingDay` int NOT NULL,
	`dueDay` int NOT NULL,
	`alertDays` int DEFAULT 3,
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `csv_presets` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`mapping` json NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `family_log` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`actorUserId` varchar(36),
	`actorName` text NOT NULL,
	`subjectUserId` varchar(36),
	`action` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`targetCents` int NOT NULL,
	`savedCents` int NOT NULL DEFAULT 0,
	`targetMonth` text NOT NULL,
	`shared` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` varchar(36) PRIMARY KEY,
	`name` text NOT NULL,
	`currency` text NOT NULL DEFAULT ('BRL'),
	`locale` text NOT NULL DEFAULT ('pt-BR'),
	`approvalsFrom` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`maintainedAt` datetime(3),
	`maintainedActivityAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`fileName` text NOT NULL,
	`format` text NOT NULL,
	`imported` int NOT NULL DEFAULT 0,
	`skipped` int NOT NULL DEFAULT 0,
	`createdBy` varchar(36),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `invite_requests` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`requestedBy` varchar(36) NOT NULL,
	`forName` text NOT NULL,
	`contactId` varchar(36),
	`status` text NOT NULL DEFAULT ('pending'),
	`inviteId` varchar(36),
	`reason` text,
	`decidedBy` varchar(36),
	`decidedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`code` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
	`label` text,
	`role` text NOT NULL DEFAULT ('member'),
	`participantId` varchar(36),
	`createdBy` varchar(36),
	`expiresAt` datetime(3) NOT NULL,
	`usedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `code_unique` UNIQUE INDEX(`code`)
);
--> statement-breakpoint
CREATE TABLE `login_failures` (
	`id` varchar(36) PRIMARY KEY,
	`email` varchar(255) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`householdId` varchar(36) NOT NULL,
	`userId` varchar(36) NOT NULL,
	`role` text NOT NULL DEFAULT ('member'),
	`participantId` varchar(36),
	`activitySeenAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT PRIMARY KEY(`householdId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `nicknames` (
	`userId` varchar(36) NOT NULL,
	`participantId` varchar(36) NOT NULL,
	`nickname` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT PRIMARY KEY(`userId`,`participantId`)
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT ('#1AC4DB'),
	`sortOrder` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`ownerUserId` varchar(36),
	`pinned` boolean NOT NULL DEFAULT false,
	`archivedAt` datetime(3),
	`temporary` boolean NOT NULL DEFAULT false,
	`photoData` longtext,
	`photoUpdatedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`purpose` text NOT NULL DEFAULT ('reset'),
	`codeHash` text NOT NULL,
	`expiresAt` datetime(3) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`usedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text NOT NULL DEFAULT ('#6366F1'),
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `purchase_keys` (
	`userId` varchar(36) PRIMARY KEY,
	`keyHash` varchar(128) NOT NULL,
	`prefix` text NOT NULL,
	`lastUsedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `keyHash_unique` UNIQUE INDEX(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `push_sent` (
	`userId` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT PRIMARY KEY(`userId`,`key`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`endpoint` varchar(700) NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`device` text,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `push_endpoint_idx` UNIQUE INDEX(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `recurring_series` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`description` text NOT NULL,
	`amountCents` int NOT NULL,
	`kind` text NOT NULL DEFAULT ('expense'),
	`payerId` varchar(36),
	`categoryId` varchar(36),
	`projectId` varchar(36),
	`statusId` varchar(36),
	`cardId` varchar(36),
	`notes` text,
	`noCategory` boolean NOT NULL DEFAULT false,
	`splits` json NOT NULL,
	`startDate` date NOT NULL,
	`nextIndex` int NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` varchar(36),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT ('#94A3B8'),
	`behavior` text NOT NULL DEFAULT ('pending'),
	`isDefault` boolean NOT NULL DEFAULT false,
	`isImportDefault` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`transactionId` varchar(36) NOT NULL,
	`participantId` varchar(36) NOT NULL,
	`amountCents` int NOT NULL,
	`paidById` varchar(36),
	CONSTRAINT PRIMARY KEY(`transactionId`,`participantId`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` varchar(36) PRIMARY KEY,
	`householdId` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`description` text NOT NULL,
	`amountCents` int NOT NULL,
	`kind` text NOT NULL DEFAULT ('expense'),
	`payerId` varchar(36),
	`categoryId` varchar(36),
	`projectId` varchar(36),
	`statusId` varchar(36),
	`settled` boolean NOT NULL DEFAULT false,
	`invoicePaid` boolean NOT NULL DEFAULT false,
	`awaitingReceipt` boolean NOT NULL DEFAULT false,
	`noCategory` boolean NOT NULL DEFAULT false,
	`settlesId` varchar(36),
	`cardId` varchar(36),
	`seriesId` varchar(36),
	`seriesKind` text,
	`seriesIndex` int,
	`seriesTotal` int,
	`notes` text,
	`source` text NOT NULL DEFAULT ('manual'),
	`externalId` varchar(255),
	`needsReview` boolean NOT NULL DEFAULT false,
	`accountId` varchar(36),
	`reuseCheck` boolean NOT NULL DEFAULT false,
	`importBatchId` varchar(36),
	`createdBy` varchar(36),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `transactions_household_external_idx` UNIQUE INDEX(`householdId`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `tx_approvals` (
	`householdId` varchar(36) NOT NULL,
	`key` varchar(36) NOT NULL,
	`participantId` varchar(36) NOT NULL,
	`status` text NOT NULL,
	`fingerprint` text NOT NULL,
	`reason` text,
	`decidedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT PRIMARY KEY(`key`,`participantId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) PRIMARY KEY,
	`email` varchar(255) NOT NULL,
	`name` text NOT NULL,
	`passwordHash` text NOT NULL,
	`avatarData` longtext,
	`pushPrefs` json NOT NULL DEFAULT ('{}'),
	`avatarUpdatedAt` datetime(3),
	`isAuditor` boolean NOT NULL DEFAULT false,
	`tourSeenAt` datetime(3),
	`username` text,
	`emailVerifiedAt` datetime(3),
	`cleanPeople` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `email_unique` UNIQUE INDEX(`email`)
);
--> statement-breakpoint
CREATE INDEX `activities_household_created_idx` ON `activities` (`householdId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auto_accept_rules_household_idx` ON `auto_accept_rules` (`householdId`);--> statement-breakpoint
CREATE INDEX `categories_household_idx` ON `categories` (`householdId`);--> statement-breakpoint
CREATE INDEX `category_rules_household_idx` ON `category_rules` (`householdId`);--> statement-breakpoint
CREATE INDEX `credit_cards_household_idx` ON `credit_cards` (`householdId`);--> statement-breakpoint
CREATE INDEX `credit_cards_owner_idx` ON `credit_cards` (`ownerId`);--> statement-breakpoint
CREATE INDEX `family_log_household_created_idx` ON `family_log` (`householdId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `invite_requests_household_idx` ON `invite_requests` (`householdId`);--> statement-breakpoint
CREATE INDEX `login_failures_email_idx` ON `login_failures` (`email`,`createdAt`);--> statement-breakpoint
CREATE INDEX `participants_household_idx` ON `participants` (`householdId`);--> statement-breakpoint
CREATE INDEX `password_resets_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
CREATE INDEX `projects_household_idx` ON `projects` (`householdId`);--> statement-breakpoint
CREATE INDEX `push_user_idx` ON `push_subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `recurring_series_household_idx` ON `recurring_series` (`householdId`);--> statement-breakpoint
CREATE INDEX `statuses_household_idx` ON `statuses` (`householdId`);--> statement-breakpoint
CREATE INDEX `splits_participant_idx` ON `transaction_splits` (`participantId`);--> statement-breakpoint
CREATE INDEX `transactions_household_date_idx` ON `transactions` (`householdId`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_card_date_idx` ON `transactions` (`cardId`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_series_idx` ON `transactions` (`seriesId`);--> statement-breakpoint
CREATE INDEX `tx_approvals_household_idx` ON `tx_approvals` (`householdId`);--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_actorUserId_users_id_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `auto_accept_rules` ADD CONSTRAINT `auto_accept_rules_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `auto_accept_rules` ADD CONSTRAINT `auto_accept_rules_participantId_participants_id_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `auto_accept_rules` ADD CONSTRAINT `auto_accept_rules_fromParticipantId_participants_id_fkey` FOREIGN KEY (`fromParticipantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_categoryId_categories_id_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `category_rules` ADD CONSTRAINT `category_rules_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `category_rules` ADD CONSTRAINT `category_rules_categoryId_categories_id_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `credit_cards` ADD CONSTRAINT `credit_cards_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `credit_cards` ADD CONSTRAINT `credit_cards_ownerId_participants_id_fkey` FOREIGN KEY (`ownerId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `csv_presets` ADD CONSTRAINT `csv_presets_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `family_log` ADD CONSTRAINT `family_log_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `family_log` ADD CONSTRAINT `family_log_actorUserId_users_id_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `family_log` ADD CONSTRAINT `family_log_subjectUserId_users_id_fkey` FOREIGN KEY (`subjectUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_createdBy_users_id_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `invite_requests` ADD CONSTRAINT `invite_requests_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `invite_requests` ADD CONSTRAINT `invite_requests_requestedBy_users_id_fkey` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `invite_requests` ADD CONSTRAINT `invite_requests_contactId_participants_id_fkey` FOREIGN KEY (`contactId`) REFERENCES `participants`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `invite_requests` ADD CONSTRAINT `invite_requests_inviteId_invites_id_fkey` FOREIGN KEY (`inviteId`) REFERENCES `invites`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `invite_requests` ADD CONSTRAINT `invite_requests_decidedBy_users_id_fkey` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_participantId_participants_id_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_createdBy_users_id_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `nicknames` ADD CONSTRAINT `nicknames_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `nicknames` ADD CONSTRAINT `nicknames_participantId_participants_id_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `participants` ADD CONSTRAINT `participants_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `participants` ADD CONSTRAINT `participants_ownerUserId_users_id_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `purchase_keys` ADD CONSTRAINT `purchase_keys_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `push_sent` ADD CONSTRAINT `push_sent_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_users_id_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_payerId_participants_id_fkey` FOREIGN KEY (`payerId`) REFERENCES `participants`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_categoryId_categories_id_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_projectId_projects_id_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_statusId_statuses_id_fkey` FOREIGN KEY (`statusId`) REFERENCES `statuses`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_cardId_credit_cards_id_fkey` FOREIGN KEY (`cardId`) REFERENCES `credit_cards`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recurring_series` ADD CONSTRAINT `recurring_series_createdBy_users_id_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `statuses` ADD CONSTRAINT `statuses_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `transaction_splits` ADD CONSTRAINT `transaction_splits_transactionId_transactions_id_fkey` FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `transaction_splits` ADD CONSTRAINT `transaction_splits_participantId_participants_id_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `transaction_splits` ADD CONSTRAINT `transaction_splits_paidById_transactions_id_fkey` FOREIGN KEY (`paidById`) REFERENCES `transactions`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_payerId_participants_id_fkey` FOREIGN KEY (`payerId`) REFERENCES `participants`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_categoryId_categories_id_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_projectId_projects_id_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_statusId_statuses_id_fkey` FOREIGN KEY (`statusId`) REFERENCES `statuses`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_settlesId_transactions_id_fkey` FOREIGN KEY (`settlesId`) REFERENCES `transactions`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_cardId_credit_cards_id_fkey` FOREIGN KEY (`cardId`) REFERENCES `credit_cards`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accountId_accounts_id_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_importBatchId_import_batches_id_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `import_batches`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_createdBy_users_id_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tx_approvals` ADD CONSTRAINT `tx_approvals_householdId_households_id_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `tx_approvals` ADD CONSTRAINT `tx_approvals_participantId_participants_id_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE;