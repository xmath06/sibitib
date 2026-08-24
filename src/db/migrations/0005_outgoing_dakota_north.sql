CREATE TABLE "teacher_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_teacher_subject" UNIQUE("user_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "questions" SET "created_by_user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1) WHERE "created_by_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "created_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "topics" SET "created_by_user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1) WHERE "created_by_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "created_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
