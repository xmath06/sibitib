CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_level" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"target_class_id" uuid,
	"target_grade_level" integer,
	"target_student_id" uuid
);
--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "target_type" text DEFAULT 'ALL_STUDENTS' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "target_religion" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "class_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "religion" text;--> statement-breakpoint
ALTER TABLE "schedule_targets" ADD CONSTRAINT "schedule_targets_schedule_id_exam_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_targets" ADD CONSTRAINT "schedule_targets_target_class_id_classes_id_fk" FOREIGN KEY ("target_class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_targets" ADD CONSTRAINT "schedule_targets_target_student_id_users_id_fk" FOREIGN KEY ("target_student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;