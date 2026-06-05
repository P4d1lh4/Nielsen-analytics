/*
  Warnings:

  - Added the required column `user_id` to the `audit_reports` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_reports" ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "audit_reports_user_id_idx" ON "audit_reports"("user_id");
