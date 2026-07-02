-- DropIndex (superseded by the composite index below)
DROP INDEX "audit_reports_user_id_idx";

-- CreateIndex
CREATE INDEX "audit_reports_user_id_created_at_idx" ON "audit_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_steps_report_id_idx" ON "audit_steps"("report_id");

-- CreateIndex
CREATE INDEX "violations_step_id_idx" ON "violations"("step_id");
