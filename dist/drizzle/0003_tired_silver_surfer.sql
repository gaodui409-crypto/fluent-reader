ALTER TABLE `items` ADD `readLater` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `highlight` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `saveRequested` integer DEFAULT false NOT NULL;