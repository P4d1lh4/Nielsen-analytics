import { AlertTriangle, CheckCircle2, Download, RotateCcw } from "lucide-react";
import type { AuditReport, Severity } from "../api/types";

interface Props {
  report: AuditReport;
  onReset?: () => void;
}

// Literal class strings (not built dynamically) so Tailwind's scanner detects them.
const SEVERITY: Record<Severity, { label: string; badge: string; bar: string }> = {
  4: { label: "Crítico", badge: "bg-red-100 text-red-700", bar: "border-l-red-500" },
  3: { label: "Maior", badge: "bg-orange-100 text-orange-700", bar: "border-l-orange-500" },
  2: { label: "Menor", badge: "bg-amber-100 text-amber-700", bar: "border-l-amber-500" },
  1: { label: "Cosmético", badge: "bg-blue-100 text-blue-700", bar: "border-l-blue-500" },
};

// pt-BR Excel opens semicolon-delimited CSVs into columns by default.
const CSV_DELIMITER = ";";

/** Wraps a field in double quotes, flattens line breaks, and escapes inner quotes. */
function csvField(value: string): string {
  const flat = String(value)
    .replace(/\r?\n|\r/g, " ") // escape line breaks so they don't break the row
    .replace(/"/g, '""'); // escape double quotes (RFC 4180)
  return `"${flat}"`;
}

/** Builds a CSV from the report and triggers an automatic download. */
function exportToCSV(report: AuditReport): void {
  const headers = ["Passo", "Imagem", "Heurística", "Severidade", "Problema", "Correção"];
  const rows: string[] = [headers.map(csvField).join(CSV_DELIMITER)];

  for (const step of report.steps) {
    for (const v of step.violations) {
      rows.push(
        [
          csvField(step.step_name),
          csvField(step.screenshot_url),
          csvField(v.heuristic),
          String(v.severity), // numeric — left unquoted
          csvField(v.issue_description),
          csvField(v.code_fix),
        ].join(CSV_DELIMITER),
      );
    }
  }

  // BOM + CRLF so Excel reads UTF-8 accents correctly and keeps rows intact.
  const csv = String.fromCharCode(0xfeff) + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-${report.job_id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditDashboard({ report, onReset }: Props) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800">Relatório de auditoria</h2>
          <p className="mt-1 text-sm text-slate-500 break-all">{report.target_url}</p>
          <p className="mt-1 text-xs text-slate-400">
            {report.steps.length} passo(s) · {new Date(report.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-800">{report.total_violations}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">violações</div>
          </div>
          <button
            onClick={() => exportToCSV(report)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> Nova
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      {report.steps.map((step) => (
        <section
          key={step.id}
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <header className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">{step.step_name}</h3>
            <span className="text-xs text-slate-400">{step.violations.length} violação(ões)</span>
          </header>

          {step.screenshot_url && (
            <a
              href={step.screenshot_url}
              target="_blank"
              rel="noreferrer"
              className="block bg-slate-50 border-b border-slate-100"
            >
              <img
                src={step.screenshot_url}
                alt={step.step_name}
                loading="lazy"
                className="w-full max-h-[460px] object-contain"
              />
            </a>
          )}

          <div className="p-4 space-y-3">
            {step.violations.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4" /> Nenhuma violação neste passo.
              </div>
            ) : (
              [...step.violations]
                .sort((a, b) => b.severity - a.severity)
                .map((v) => {
                  const sev = SEVERITY[v.severity];
                  return (
                    <article
                      key={v.id}
                      className={`rounded-lg border border-slate-200 border-l-4 ${sev.bar} bg-white p-4`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-slate-400 shrink-0" />
                          {v.heuristic}
                        </h4>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${sev.badge}`}
                        >
                          {sev.label} · {v.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        {v.issue_description}
                      </p>
                      {v.code_fix && (
                        <pre className="mt-3 rounded-md bg-slate-900 text-slate-100 text-xs p-3 overflow-x-auto">
                          <code>{v.code_fix}</code>
                        </pre>
                      )}
                    </article>
                  );
                })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
