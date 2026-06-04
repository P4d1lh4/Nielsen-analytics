import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuditResult } from "../api/auditService";
import type { AuditReport } from "../api/types";

const POLL_INTERVAL_MS = 3000;

interface Props {
  jobId: string;
  onComplete: (report: AuditReport) => void;
  onFailed: (message: string) => void;
}

export function AuditPolling({ jobId, onComplete, onFailed }: Props) {
  // Keep the latest callbacks in refs so the polling effect depends only on jobId.
  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onFailedRef.current = onFailed;
  });

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let elapsedTimer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
      if (elapsedTimer) clearInterval(elapsedTimer);
    };

    async function poll() {
      try {
        const result = await getAuditResult(jobId);
        if (!active) return;
        if (result.status === "completed") {
          stop();
          onCompleteRef.current(result.report);
        } else if (result.status === "failed") {
          stop();
          onFailedRef.current(result.reason ?? "A auditoria falhou.");
        }
        // "processing" (or "queued") -> keep polling
      } catch (err) {
        if (!active) return;
        stop();
        onFailedRef.current(err instanceof Error ? err.message : String(err));
      }
    }

    elapsedTimer = setInterval(() => setElapsed((e) => e + 1), 1000);
    void poll(); // immediate first check
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return stop;
  }, [jobId]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center">
      <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
      <h2 className="mt-4 text-lg font-semibold text-slate-800">Auditoria em andamento</h2>
      <p className="mt-1 text-sm text-slate-500">
        Job <code className="font-mono text-slate-700">{jobId}</code> · processando há {elapsed}s
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Captura headless + análise por IA — pode levar alguns minutos.
      </p>
    </div>
  );
}
