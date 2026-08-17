CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_coach_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "student_coach_links_ended_after_started_check" CHECK ("student_coach_links"."ended_at" IS NULL OR "student_coach_links"."ended_at" > "student_coach_links"."started_at")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_coach_links" ADD CONSTRAINT "student_coach_links_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_coach_links" ADD CONSTRAINT "student_coach_links_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_coach_links_active_pair_unique" ON "student_coach_links" USING btree ("student_id","coach_id") WHERE "student_coach_links"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "student_coach_links_student_started_idx" ON "student_coach_links" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE INDEX "student_coach_links_coach_started_idx" ON "student_coach_links" USING btree ("coach_id","started_at");