DROP INDEX "push_subscriptions_endpoint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_family_idx" ON "push_subscriptions" USING btree ("endpoint","family_id");