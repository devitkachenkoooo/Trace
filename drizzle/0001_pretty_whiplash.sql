CREATE TABLE "upload_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "recipient_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "chat_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "reply_to_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "user_last_read_id" uuid;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "recipient_last_read_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_audit" ADD CONSTRAINT "upload_audit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_upload_audit_user_time" ON "upload_audit" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_last_read_id_messages_id_fk" FOREIGN KEY ("user_last_read_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_recipient_last_read_id_messages_id_fk" FOREIGN KEY ("recipient_last_read_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chats_users" ON "chats" USING btree ("user_id","recipient_id");--> statement-breakpoint
CREATE INDEX "idx_messages_chat_created" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_sender" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "is_read";