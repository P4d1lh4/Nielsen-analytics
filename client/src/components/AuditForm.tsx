import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { submitAudit } from "../api/auditService";
import type { FlowAction } from "../api/types";

const DEFAULT_URL = "https://example.com";
const DEFAULT_FLOW = JSON.stringify(
  [{ action: "goto", url: DEFAULT_URL }] satisfies FlowAction[],
  null,
  2,
);

interface Props {
  /** Called with the new job id once the audit is accepted by the backend. */
  onSubmitted: (jobId: string) => void;
}

export function AuditForm({ onSubmitted }: Props) {
  const [targetUrl, setTargetUrl] = useState(DEFAULT_URL);
  const [flowJson, setFlowJson] = useState(DEFAULT_FLOW);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    let flow: unknown;
    try {
      flow = JSON.parse(flowJson);
    } catch {
      setError("Flow inválido: JSON malformado.");
      return;
    }
    if (!Array.isArray(flow) || flow.length === 0) {
      setError("O flow deve ser um array com ao menos uma ação.");
      return;
    }

    setSubmitting(true);
    try {
      const jobId = await submitAudit({ target_url: targetUrl, flow: flow as FlowAction[] });
      onSubmitted(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5"
    >
      <div>
        <label htmlFor="target_url" className="block text-sm font-medium text-slate-700 mb-1">
          URL alvo
        </label>
        <input
          id="target_url"
          type="url"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="flow" className="block text-sm font-medium text-slate-700 mb-1">
          Fluxo (JSON)
        </label>
        <textarea
          id="flow"
          rows={8}
          value={flowJson}
          onChange={(e) => setFlowJson(e.target.value)}
          spellCheck={false}
          aria-describedby="flow-hint"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p id="flow-hint" className="mt-1 text-xs text-slate-400">
          Ações suportadas: goto · click · type · wait · scroll
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {submitting ? "Enviando..." : "Iniciar auditoria"}
      </button>
    </form>
  );
}
