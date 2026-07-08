-- Add login credentials to TeamMember
ALTER TABLE "TeamMember" ADD COLUMN "username" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN "password" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN "rbacRole" TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE "TeamMember" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TeamMember" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "TeamMember_username_key" ON "TeamMember"("username");
