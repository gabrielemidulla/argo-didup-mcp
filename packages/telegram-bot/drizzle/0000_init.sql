CREATE TABLE `automations` (
	`id` varchar(36) NOT NULL,
	`prompt` text NOT NULL,
	`cron_expression` varchar(128) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
