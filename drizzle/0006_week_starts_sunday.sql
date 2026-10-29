-- Weeks now start on Sunday. A shopping tick's key starts with its week's first
-- day, so move each Monday-keyed tick to the Sunday before.
UPDATE OR IGNORE `checks`
SET `key` = date(substr(`key`, 1, 10), '-1 day') || substr(`key`, 11)
WHERE `kind` = 'ticked' AND strftime('%w', substr(`key`, 1, 10)) = '1';
--> statement-breakpoint
DELETE FROM `checks` WHERE `kind` = 'ticked' AND strftime('%w', substr(`key`, 1, 10)) = '1';
