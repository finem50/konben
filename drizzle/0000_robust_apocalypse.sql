CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`recipes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checks` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_entries` (
	`date_key` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`servings` integer NOT NULL,
	`cook_for` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`goals` text NOT NULL
);
