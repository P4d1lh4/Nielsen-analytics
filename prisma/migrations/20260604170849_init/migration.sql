-- CreateTable
CREATE TABLE "audit_reports" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_violations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "audit_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_steps" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "screenshot_url" TEXT NOT NULL,

    CONSTRAINT "audit_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "heuristic" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "issue_description" TEXT NOT NULL,
    "code_fix" TEXT NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_reports_job_id_key" ON "audit_reports"("job_id");

-- AddForeignKey
ALTER TABLE "audit_steps" ADD CONSTRAINT "audit_steps_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "audit_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "audit_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
