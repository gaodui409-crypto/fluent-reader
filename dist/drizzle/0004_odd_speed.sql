CREATE TABLE `ai_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`itemId` integer,
	`kind` text NOT NULL,
	`result` text NOT NULL,
	`createdAt` integer NOT NULL,
	`tokens` integer,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdAt` integer NOT NULL,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`input` integer,
	`output` integer
);
--> statement-breakpoint
CREATE TABLE `article_activity` (
	`itemId` integer PRIMARY KEY NOT NULL,
	`openedAt` integer NOT NULL,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `briefings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdAt` integer NOT NULL,
	`content` text NOT NULL,
	`tokens` integer
);
--> statement-breakpoint
CREATE TABLE `source_health` (
	`sid` integer PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`lastError` text DEFAULT '' NOT NULL,
	`checkedAt` integer DEFAULT 0 NOT NULL,
	`redirect` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`sid`) REFERENCES `sources`(`sid`) ON UPDATE no action ON DELETE cascade
);
