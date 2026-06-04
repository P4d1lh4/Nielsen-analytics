import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readManifest } from "../evaluator/manifest";
import { stepName } from "../evaluator/payload";
import type { AuditReport } from "../evaluator/report";
import type { Violation } from "../evaluator/auditSchema";

/** Raised for any problem reading inputs or generating the dashboard. */
export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardError";
  }
}

/** The one and only audit report filename produced by Phase 2. */
const REPORT_FILENAME = "audit-report.json";

interface DashboardStep {
  step_name: string;
  action: string;
  screenshot: string; // relative to the report dir — baked in, no fetch needed
  violations: Violation[];
  error?: string;
}

interface DashboardData {
  generated_at: string;
  model: string;
  summary: {
    total_steps: number;
    analyzed_steps: number;
    total_violations: number;
    severity: Record<1 | 2 | 3 | 4, number>;
  };
  steps: DashboardStep[];
}

/** Reads and parses `audit-report.json` from a report directory. No fallbacks. */
function readAuditReport(reportDir: string): AuditReport {
  const path = join(reportDir, REPORT_FILENAME);
  if (!existsSync(path)) {
    throw new DashboardError(`Audit report not found: ${path}. Run \`ux-audit analyze\` first.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new DashboardError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as AuditReport).results)) {
    throw new DashboardError(`Unexpected audit report shape in ${path} (missing 'results' array).`);
  }
  return parsed as AuditReport;
}

/** Merges the manifest (screenshots) with the audit report (violations) into the baked-in dataset. */
function assembleData(reportDir: string): DashboardData {
  const manifest = readManifest(reportDir); // executed steps + relative artifact paths
  const report = readAuditReport(reportDir);

  const auditByStep = new Map(report.results.map((r) => [r.step_name, r]));
  const errorByStep = new Map((report.errors ?? []).map((e) => [e.step_name, e.error]));

  const severity: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const steps: DashboardStep[] = manifest.map((entry) => {
    const name = stepName(entry);
    const violations = auditByStep.get(name)?.violations ?? [];
    for (const v of violations) severity[v.severity]++;
    return {
      step_name: name,
      action: entry.action,
      screenshot: entry.artifacts.screenshot, // already relative to the report dir
      violations,
      error: errorByStep.get(name),
    };
  });

  return {
    generated_at: report.generated_at ?? "",
    model: report.model ?? "",
    summary: {
      total_steps: manifest.length,
      analyzed_steps: report.analyzed_steps ?? report.results.length,
      total_violations:
        report.total_violations ?? steps.reduce((n, s) => n + s.violations.length, 0),
      severity,
    },
    steps,
  };
}

/** Generates `dashboard.html` in the report directory and returns its path. */
export function writeDashboard(reportDir: string): string {
  const data = assembleData(reportDir);
  const html = renderDashboardHtml(data);
  const path = join(reportDir, "dashboard.html");
  writeFileSync(path, html, "utf8");
  return path;
}

// --- HTML template (single file; Tailwind via CDN; data baked into a <script>) ---

/** Client-side renderer. No template literals / no `$` so it can live in a TS template string. */
const CLIENT_JS = `
(function () {
  var data = auditData;
  var SEV = {
    1: { label: 'Cosmetico', color: '#2563eb' },
    2: { label: 'Menor', color: '#ca8a04' },
    3: { label: 'Maior', color: '#ea580c' },
    4: { label: 'Critico', color: '#dc2626' }
  };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function worst(vs) { var w = 0; for (var i = 0; i < vs.length; i++) if (vs[i].severity > w) w = vs[i].severity; return w; }

  document.getElementById('sum-steps').textContent = data.summary.total_steps;
  document.getElementById('sum-analyzed').textContent = data.summary.analyzed_steps;
  document.getElementById('sum-violations').textContent = data.summary.total_violations;
  document.getElementById('meta-model').textContent = data.model || '-';
  document.getElementById('meta-date').textContent = data.generated_at || '';

  var sevWrap = document.getElementById('sev-counters');
  [4, 3, 2, 1].forEach(function (s) {
    var chip = el('div', 'flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-medium shadow-sm');
    chip.style.backgroundColor = SEV[s].color;
    chip.appendChild(el('span', null, SEV[s].label));
    chip.appendChild(el('span', 'font-bold', String(data.summary.severity[s] || 0)));
    sevWrap.appendChild(chip);
  });

  var nav = document.getElementById('nav');
  var buttons = [];
  data.steps.forEach(function (step, idx) {
    var btn = el('button', 'w-full text-left px-3 py-2 rounded-lg hover:bg-slate-200 transition flex items-center justify-between gap-2');
    btn.appendChild(el('span', 'truncate text-sm font-medium text-slate-700', step.step_name));
    var count = step.violations.length;
    var badge = el('span', 'shrink-0 text-xs font-bold text-white rounded-full px-2 py-0.5');
    badge.textContent = String(count);
    badge.style.backgroundColor = count ? SEV[worst(step.violations)].color : '#94a3b8';
    btn.appendChild(badge);
    btn.addEventListener('click', function () { select(idx); });
    nav.appendChild(btn);
    buttons.push(btn);
  });

  function select(idx) {
    buttons.forEach(function (b, i) { b.classList.toggle('bg-slate-200', i === idx); });
    render(data.steps[idx]);
  }

  function render(step) {
    var main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(el('h2', 'text-xl font-bold text-slate-800', step.step_name));
    main.appendChild(el('p', 'text-sm text-slate-500 mb-4', 'Acao: ' + step.action));

    var fig = el('div', 'mb-6 rounded-lg overflow-hidden border border-slate-200 bg-white');
    var link = el('a', 'block'); link.href = step.screenshot; link.target = '_blank';
    var img = el('img', 'w-full object-contain bg-slate-50');
    img.style.maxHeight = '440px';
    img.src = step.screenshot; img.alt = step.step_name; img.loading = 'lazy';
    img.onerror = function () {
      fig.innerHTML = '';
      fig.appendChild(el('div', 'p-4 text-sm text-slate-400', 'Screenshot nao encontrado: ' + step.screenshot));
    };
    link.appendChild(img); fig.appendChild(link); main.appendChild(fig);

    if (step.error) {
      main.appendChild(el('div', 'mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm', 'Falha na analise: ' + step.error));
    }

    if (!step.violations.length) {
      main.appendChild(el('div', 'p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700', step.error ? 'Sem violacoes registradas.' : 'Nenhuma violacao encontrada neste passo.'));
      return;
    }

    main.appendChild(el('h3', 'text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3', step.violations.length + ' violacao(oes)'));
    step.violations.slice().sort(function (a, b) { return b.severity - a.severity; }).forEach(function (v) {
      main.appendChild(card(v));
    });
  }

  function card(v) {
    var sev = SEV[v.severity] || SEV[1];
    var c = el('div', 'mb-4 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden');
    c.style.borderLeft = '4px solid ' + sev.color;

    var head = el('div', 'flex items-start justify-between gap-3 p-4 pb-2');
    var left = el('div');
    left.appendChild(el('div', 'font-semibold text-slate-800', v.heuristic));
    if (v.element_selector) {
      var sw = el('div', 'mt-1');
      sw.appendChild(el('code', 'text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5', v.element_selector));
      left.appendChild(sw);
    }
    head.appendChild(left);
    var badge = el('span', 'shrink-0 text-xs font-bold text-white rounded-full px-3 py-1');
    badge.style.backgroundColor = sev.color;
    badge.textContent = sev.label + ' \\u00b7 ' + v.severity;
    head.appendChild(badge);
    c.appendChild(head);

    c.appendChild(el('p', 'px-4 text-sm text-slate-600 leading-relaxed', v.issue_description));

    if (v.suggested_code_fix) {
      var fixWrap = el('div', 'p-4 pt-3');
      fixWrap.appendChild(el('div', 'text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1', 'Correcao sugerida'));
      var pre = el('pre', 'rounded-md bg-slate-900 text-slate-100 text-xs p-3 overflow-x-auto');
      pre.appendChild(el('code', null, v.suggested_code_fix));
      fixWrap.appendChild(pre);
      c.appendChild(fixWrap);
    }
    return c;
  }

  if (data.steps.length) select(0);
  else document.getElementById('main').appendChild(el('div', 'text-slate-500', 'Nenhum passo no relatorio.'));
})();
`;

function renderDashboardHtml(data: DashboardData): string {
  // Bake the data in. Escape '<' (prevents </script> breakout) and the JS line
  // separators U+2028/U+2029 (legal in JSON, illegal in a JS string literal).
  const json = JSON.stringify(data).split("<").join(String.fromCharCode(92) + "u003c");

  const head = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UX Audit Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 text-slate-800">
<header class="bg-white border-b border-slate-200 shadow-sm">
  <div class="max-w-7xl mx-auto px-6 py-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-lg font-bold text-slate-800">UX Audit Dashboard</h1>
      <div class="text-xs text-slate-400 text-right">
        <div>Model: <span id="meta-model" class="font-medium text-slate-600"></span></div>
        <div id="meta-date"></div>
      </div>
    </div>
    <div class="mt-4 flex items-center gap-4 flex-wrap">
      <div class="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <div class="text-2xl font-bold text-slate-800" id="sum-steps">0</div>
        <div class="text-xs text-slate-500 uppercase tracking-wide">Passos</div>
      </div>
      <div class="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <div class="text-2xl font-bold text-slate-800" id="sum-analyzed">0</div>
        <div class="text-xs text-slate-500 uppercase tracking-wide">Analisados</div>
      </div>
      <div class="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <div class="text-2xl font-bold text-slate-800" id="sum-violations">0</div>
        <div class="text-xs text-slate-500 uppercase tracking-wide">Violacoes</div>
      </div>
      <div id="sev-counters" class="flex items-center gap-2 flex-wrap"></div>
    </div>
  </div>
</header>
<div class="max-w-7xl mx-auto px-6 py-6 flex gap-6 items-start">
  <aside class="w-64 shrink-0 sticky top-6">
    <div class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">Passos</div>
    <nav id="nav" class="space-y-1"></nav>
  </aside>
  <main id="main" class="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-6"></main>
</div>`;

  return (
    head +
    "\n<script>const auditData = " +
    json +
    ";</script>\n<script>" +
    CLIENT_JS +
    "</script>\n</body>\n</html>\n"
  );
}
