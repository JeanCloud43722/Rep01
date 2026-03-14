CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"scheduled_time" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"notes" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subscription" jsonb,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('waiting','subscribed','scheduled','notified','completed'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_scheduled_time_idx" ON "orders" USING btree ("scheduled_time") WHERE "orders"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_order_id_idx" ON "push_subscriptions" USING btree ("order_id");