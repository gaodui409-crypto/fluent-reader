CREATE TABLE `archive_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer NOT NULL,
	`undone` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `archive_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`spec` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `article_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parentId` integer,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`legacyName` text,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`parentId`) REFERENCES `article_folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_folders_legacyName_unique` ON `article_folders` (`legacyName`);--> statement-breakpoint
CREATE TABLE `article_notes` (
	`itemId` integer PRIMARY KEY NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folder_articles` (
	`folderId` integer NOT NULL,
	`itemId` integer NOT NULL,
	`stamp` text NOT NULL,
	PRIMARY KEY(`folderId`, `itemId`),
	FOREIGN KEY (`folderId`) REFERENCES `article_folders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folder_articles_item` ON `folder_articles` (`itemId`);--> statement-breakpoint
ALTER TABLE `items` ADD `feedHidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `archived` integer DEFAULT false NOT NULL;