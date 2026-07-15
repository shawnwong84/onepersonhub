-- Registration now collects an email address per Admin (used for the
-- Resend welcome email). Backfill existing rows with a placeholder derived
-- from their username before constraining, since the column can't start
-- NOT NULL + UNIQUE with existing rows present.
ALTER TABLE "Admin" ADD COLUMN "email" TEXT;

UPDATE "Admin" SET "email" = "username" || '@placeholder.local' WHERE "email" IS NULL;

ALTER TABLE "Admin" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
