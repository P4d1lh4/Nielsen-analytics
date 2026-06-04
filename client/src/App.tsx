import { useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { AuditForm } from "./components/AuditForm";
import { AuditPolling } from "./components/AuditPolling";
import { AuditDashboard } from "./components/AuditDashboard";
import type { AuditReport } from "./api/types";

// Simple client state machine: idle -> polling -> (result | error).
type View =
  | { kind: "idle" }
  | { kind: "polling"; jobId: string }
  | { kind: "result"; report: AuditReport }
  | { kind: "error"; message: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "idle" });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-slate-800">UX Audit</h1>
          <p className="text-sm text-slate-500">Auditoria heurística de UI — Nielsen + WCAG 2.1</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {view.kind === "idle" && (
          <AuditForm onSubmitted={(jobId) => setView({ kind: "polling", jobId })} />
        )}

        {view.kind === "polling" && (
          <AuditPolling
            jobId={view.jobId}
            onComplete={(report) => setView({ kind: "result", report })}
            onFailed={(message) => setView({ kind: "error", message })}
          />
        )}

        {view.kind === "result" && (
          <AuditDashboard report={view.report} onReset={() => setView({ kind: "idle" })} />
        )}

        {view.kind === "error" && (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
            <h2 className="mt-3 text-lg font-semibold text-slate-800">Falha na auditoria</h2>
            <p className="mt-1 text-sm text-red-600 break-words">{view.message}</p>
            <button
              onClick={() => setView({ kind: "idle" })}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <RotateCcw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
