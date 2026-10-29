CREATE TABLE `pantry_items` (
	`key` text PRIMARY KEY NOT NULL,
	`item` text NOT NULL,
	`use_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
