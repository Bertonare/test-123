import { TestRunRecord } from '../../types';

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatRunAsCsv(run: TestRunRecord): string {
  const header = [
    'runId',
    'projectId',
    'environment',
    'layer',
    'caseType',
    'suite',
    'title',
    'status',
    'durationMs',
    'failureMessage',
  ].join(',');

  const rows = (run.cases || []).map((c) =>
    [
      run.id,
      run.projectId || 'all',
      run.environment || 'local',
      run.layer,
      c.caseType,
      c.suite,
      c.title,
      c.status,
      c.durationMs,
      c.failureMessage || '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [header, ...rows].join('\n');
}

export function formatRunHistoryAsCsv(runs: TestRunRecord[]): string {
  const header = [
    'runId',
    'projectId',
    'environment',
    'layer',
    'caseFilter',
    'triggeredBy',
    'status',
    'total',
    'passed',
    'failed',
    'skipped',
    'positive',
    'negative',
    'edge',
    'durationMs',
    'startedAt',
  ].join(',');

  const rows = runs.map((r) =>
    [
      r.id,
      r.projectId || 'all',
      r.environment || 'local',
      r.layer,
      r.caseType || 'all',
      r.triggeredBy,
      r.status,
      r.summary.total,
      r.summary.passed,
      r.summary.failed,
      r.summary.skipped,
      r.summary.byType?.positive ?? 0,
      r.summary.byType?.negative ?? 0,
      r.summary.byType?.edge ?? 0,
      r.durationMs ?? '',
      r.startedAt,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [header, ...rows].join('\n');
}

export function formatRunAsHtml(run: TestRunRecord): string {
  const byType = run.summary.byType || { positive: 0, negative: 0, edge: 0 };
  const passRate =
    run.summary.total > 0 ? Math.round((run.summary.passed / run.summary.total) * 100) : 0;

  const caseRows = (run.cases || [])
    .map(
      (c) => `
      <tr>
        <td><span class="badge badge-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
        <td><span class="badge badge-${escapeHtml(c.caseType)}">${escapeHtml(c.caseType)}</span></td>
        <td>${escapeHtml(c.suite)}</td>
        <td>${escapeHtml(c.title)}${c.failureMessage ? `<pre class="err">${escapeHtml(c.failureMessage)}</pre>` : ''}</td>
        <td>${escapeHtml(c.durationMs)} ms</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Test Control Report - ${escapeHtml(run.id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px; }
    .container { max-width: 1080px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { color: #475569; font-size: 13px; margin-bottom: 20px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .kpi { background: #f1f5f9; border-radius: 8px; padding: 12px 14px; }
    .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748b; }
    .kpi-val { font-size: 22px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { background: #f8fafc; color: #475569; font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-passed, .badge-positive { background: #dcfce7; color: #166534; }
    .badge-failed, .badge-negative { background: #fee2e2; color: #991b1b; }
    .badge-edge { background: #f3e8ff; color: #6b21a8; }
    .badge-skipped { background: #e2e8f0; color: #475569; }
    .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; margin-top: 6px; }
    @media print { body { padding: 0; background: #fff; } .container { border: none; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Control — Execution Report</h1>
    <div class="meta">
      Run: <strong>${escapeHtml(run.id)}</strong> · Project: <strong>${escapeHtml(run.projectId || 'all')}</strong> ·
      Env: <strong>${escapeHtml(run.environment || 'local')}</strong> · Layer: <strong>${escapeHtml(run.layer)}</strong> ·
      Started: <strong>${escapeHtml(run.startedAt)}</strong>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Status</div><div class="kpi-val">${escapeHtml(run.status.toUpperCase())}</div></div>
      <div class="kpi"><div class="kpi-label">Pass Rate</div><div class="kpi-val">${passRate}% (${run.summary.passed}/${run.summary.total})</div></div>
      <div class="kpi"><div class="kpi-label">Duration</div><div class="kpi-val">${escapeHtml(run.durationMs ?? 0)} ms</div></div>
      <div class="kpi"><div class="kpi-label">Case Mix</div><div class="kpi-val">${byType.positive}P / ${byType.negative}N / ${byType.edge}E</div></div>
    </div>
    <table>
      <thead><tr><th>Status</th><th>Type</th><th>Suite</th><th>Test Case</th><th>Duration</th></tr></thead>
      <tbody>${caseRows || '<tr><td colspan="5">No test cases recorded.</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>`;
}
