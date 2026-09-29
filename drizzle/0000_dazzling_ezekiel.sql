CREATE TYPE "public"."check_status" AS ENUM('up', 'degraded', 'down');--> statement-breakpoint
CREATE TABLE "checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint_id" integer NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"status" "check_status" NOT NULL,
	"error_type" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "endpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"latency_threshold_ms" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "endpoints_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checks_endpoint_id_checked_at_idx" ON "checks" USING btree ("endpoint_id","checked_at" DESC NULLS LAST);