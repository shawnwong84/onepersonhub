-- Session invalidation on password change: track a token version per
-- login-capable identity (Admin owner account, TeamMember login).
ALTER TABLE "Admin" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamMember" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
