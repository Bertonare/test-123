const state = {
  overview: null,
  selectedProject: 'all',
  selectedEnv: 'local',
  selectedCaseType: 'all',
  selectedRunId: null,
  selectedBuildId: null,
  suiteViewMode: 'list',
  expandedSuites: new Set(),
  searchBackend: '',
  searchFrontend: '',
  cypressHeaded: false,
  cypressBrowser: 'electron',
  cypressKeepOpen: false,
  runPollTimer: null,
  buildPollTimer: null,
};

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function fmtDuration(ms) {
  if (ms == null) return '-';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function badgeHtml(status) {
  const s = String(status || 'unknown').toLowerCase();
  return `<span class="badge badge-${s}">${s}</span>`;
}

function cleanCaseTitle(title) {
  return String(title || '').replace(/^\[(positive|negative|edge)\]\s*/i, '');
}

function breakdownHtml(bd) {
  const b = bd || { positive: 0, negative: 0, edge: 0 };
  return `
    <div class="breakdown-pills">
      <span class="badge badge-positive">Pos: ${b.positive}</span>
      <span class="badge badge-negative">Neg: ${b.negative}</span>
      <span class="badge badge-edge">Edge: ${b.edge}</span>
    </div>`;
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
  const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  document.getElementById('page-title').textContent = activeBtn ? activeBtn.textContent : 'Test Control';

  if (tabId === 'dummy-data') loadDummyData();
  if (tabId === 'ai-agent') loadAiDiagnostics();
  if (tabId === 'jenkins') refreshJenkins();
}

async function triggerRun(layer, targetFile, overrideProject) {
  const projectId = overrideProject || (state.selectedProject === 'all' ? undefined : state.selectedProject);
  const isFrontend = layer === 'frontend-e2e' || layer === 'all';
  try {
    const run = await api('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        environment: state.selectedEnv,
        layer,
        caseType: state.selectedCaseType,
        headed: isFrontend ? state.cypressHeaded : false,
        browser: isFrontend ? state.cypressBrowser : undefined,
        keepOpen: isFrontend && state.cypressHeaded ? state.cypressKeepOpen : false,
        targetFile,
        triggeredBy: 'dashboard',
      }),
    });
    state.selectedRunId = run.id;
    if (isFrontend && state.cypressHeaded && !run.headed) {
      showToast('Server is running an older build — restart "npm run dashboard" to enable Headed mode.');
    } else {
      const modeTag = isFrontend && state.cypressHeaded ? ` · headed (${state.cypressBrowser})` : '';
      showToast(`Started ${layer} [${projectId || 'all'} · ${state.selectedEnv}${modeTag}]`);
    }
    switchTab('runs');
    await refreshAll();
    startPollingRun(run.id);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function startPollingRun(runId) {
  if (state.runPollTimer) clearInterval(state.runPollTimer);
  state.runPollTimer = setInterval(async () => {
    try {
      const run = await api(`/api/runs/${runId}`);
      renderRunDetail(run);
      if (run.status !== 'running' && run.status !== 'queued') {
        clearInterval(state.runPollTimer);
        state.runPollTimer = null;
        await refreshAll();
      }
    } catch {
      clearInterval(state.runPollTimer);
    }
  }, 1000);
}

async function triggerJenkinsPipeline(params = {}) {
  try {
    const payload = {
      projectId: params.projectId || document.getElementById('jk-project')?.value || state.selectedProject,
      environment: params.environment || document.getElementById('jk-env')?.value || state.selectedEnv,
      testLayer: params.testLayer || document.getElementById('jk-layer')?.value || 'all',
      caseType: params.caseType || document.getElementById('jk-case-type')?.value || state.selectedCaseType,
      tags: params.tags ?? document.getElementById('jk-tags')?.value ?? '',
      branch: params.branch ?? document.getElementById('jk-branch')?.value ?? 'main',
    };
    const build = await api('/api/jenkins/trigger', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.selectedBuildId = build.id;
    showToast(`Jenkins #${build.buildNumber} triggered (${build.parameters.PROJECT})`);
    switchTab('jenkins');
    await refreshJenkins();
    startPollingBuild(build.id);
  } catch (err) {
    showToast(`Jenkins error: ${err.message}`);
  }
}

function startPollingBuild(buildId) {
  if (state.buildPollTimer) clearInterval(state.buildPollTimer);
  state.buildPollTimer = setInterval(async () => {
    try {
      const build = await api(`/api/jenkins/builds/${buildId}`);
      renderJenkinsBuildDetail(build);
      if (build.result !== 'BUILDING' && build.result !== 'QUEUED') {
        clearInterval(state.buildPollTimer);
        state.buildPollTimer = null;
        await refreshJenkins();
        await refreshAll();
      }
    } catch {
      clearInterval(state.buildPollTimer);
    }
  }, 1000);
}

async function viewSource(suiteId) {
  try {
    const data = await api(`/api/suites/${suiteId}/source`);
    document.getElementById('modal-file-title').textContent = data.filePath;
    document.getElementById('modal-file-body').textContent = data.content;
    document.getElementById('source-modal').classList.remove('hidden');
  } catch (err) {
    showToast(err.message);
  }
}

function renderTrend(analytics) {
  const container = document.getElementById('trend-bars');
  const summaryEl = document.getElementById('trend-summary');
  const trend = analytics?.trend || [];
  if (trend.length === 0) {
    container.innerHTML = '<span class="muted">No completed runs yet.</span>';
    summaryEl.textContent = '-';
    return;
  }

  const avg = Math.round(trend.reduce((a, b) => a + b.passRate, 0) / trend.length);
  summaryEl.textContent = `Avg Pass Rate: ${avg}% (${trend.length} runs)`;

  container.innerHTML = trend
    .map((t) => {
      const h = Math.max(12, Math.round((t.passRate / 100) * 40));
      const cls = t.status === 'passed' ? 'ok' : 'fail';
      return `
        <div class="trend-bar-wrap" title="${t.id} (${t.layer}): ${t.passRate}%">
          <div class="trend-bar ${cls}" style="height:${h}px"></div>
          <span class="trend-label">${t.passRate}%</span>
        </div>`;
    })
    .join('');
}

function renderProjectsGrid(projects, suites) {
  const container = document.getElementById('projects-grid');
  container.innerHTML = projects
    .map((p) => {
      const projSuites = suites.filter((s) => s.projectId === p.id);
      const breakdown = projSuites.reduce(
        (acc, s) => ({
          positive: acc.positive + (s.caseBreakdown?.positive || 0),
          negative: acc.negative + (s.caseBreakdown?.negative || 0),
          edge: acc.edge + (s.caseBreakdown?.edge || 0),
        }),
        { positive: 0, negative: 0, edge: 0 }
      );
      const hasFail = projSuites.some((s) => s.lastStatus === 'failed');
      const allPass = projSuites.length > 0 && projSuites.every((s) => s.lastStatus === 'passed');
      const status = hasFail ? 'failed' : allPass ? 'passed' : 'unknown';

      return `
      <div class="suite-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div class="suite-title">${p.id}</div>
          ${badgeHtml(status)}
        </div>
        <div class="muted">${p.type} · ${p.owner}</div>
        ${breakdownHtml(breakdown)}
        <div class="action-row">
          <button class="btn btn-sm btn-primary" onclick="window.__runSuite('${p.defaultLayer}', undefined, '${p.id}')">Run</button>
          <button class="btn btn-sm btn-accent" onclick="window.__runInJenkins('${p.id}', '${p.defaultLayer}')">Jenkins</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderCaseItems(cases) {
  if (!cases || cases.length === 0) {
    return '<p class="muted" style="margin:4px 0;">No test cases match this filter.</p>';
  }
  return `
    <ul class="case-mini-list">
      ${cases
        .map(
          (c) => `
          <li>
            <span class="case-mini-left">${badgeHtml(c.caseType)} <span>${cleanCaseTitle(c.title)}</span></span>
            <span class="muted">L${c.line}</span>
          </li>`
        )
        .join('')}
    </ul>`;
}

function filterSuitesBySearch(suites, term) {
  const q = term.trim().toLowerCase();
  if (!q) return suites;
  return suites.filter(
    (s) =>
      s.filePath.toLowerCase().includes(q) ||
      s.projectId.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.testCases.some((c) => c.title.toLowerCase().includes(q))
  );
}

function compactMixHtml(bd) {
  const b = bd || { positive: 0, negative: 0, edge: 0 };
  return `<span class="case-mix-chip" title="Positive / Negative / Edge">${b.positive}P · ${b.negative}N · ${b.edge}E</span>`;
}

function fmtCaseCount(count) {
  return `${count} ${count === 1 ? 'case' : 'cases'}`;
}

function renderSuites(suites, containerId, searchTerm) {
  const container = document.getElementById(containerId);
  const filtered = filterSuitesBySearch(suites, searchTerm);
  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">No matching test suites.</p>';
    container.className = '';
    return;
  }

  const runBtnLabel = (layer) =>
    layer === 'frontend-e2e' && state.cypressHeaded ? 'Run (Headed)' : 'Run';

  if (state.suiteViewMode === 'cards') {
    container.className = 'suite-grid';
    container.innerHTML = filtered
      .map((s) => {
        const isOpen = state.expandedSuites.has(s.id);
        return `
        <div class="suite-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer;" onclick="window.__toggleSuite('${s.id}')">
            <div class="suite-title"><span class="suite-chevron">${isOpen ? '▾' : '▸'}</span> ${s.projectId}</div>
            ${badgeHtml(s.lastStatus)}
          </div>
          <div class="suite-path">${s.filePath}</div>
          ${breakdownHtml(s.caseBreakdown)}
          ${isOpen ? `<div class="suite-cases-drawer" style="margin:8px 0 10px;border-radius:6px;">${renderCaseItems(s.testCases)}</div>` : ''}
          <div class="action-row" style="margin-top:8px;">
            <button class="btn btn-sm btn-secondary" onclick="window.__toggleSuite('${s.id}')">${isOpen ? 'Hide' : 'Cases'} (${s.testCases.length})</button>
            <button class="btn btn-sm btn-primary" onclick="window.__runSuite('${s.layer}','${s.filePath}','${s.projectId}')">${runBtnLabel(s.layer)}</button>
            <button class="btn btn-sm btn-accent" onclick="window.__runInJenkins('${s.projectId}','${s.layer}')">Jenkins</button>
            <button class="btn btn-sm btn-secondary" onclick="window.__viewSource('${s.id}')">Code</button>
          </div>
        </div>`;
      })
      .join('');
    return;
  }

  container.className = 'suite-list';
  container.innerHTML = filtered
    .map((s) => {
      const isOpen = state.expandedSuites.has(s.id);
      return `
      <div class="suite-list-item">
        <div class="suite-list-row" onclick="window.__toggleSuite('${s.id}')">
          <div class="suite-list-left">
            <span class="suite-chevron">${isOpen ? '▾' : '▸'}</span>
            ${badgeHtml(s.lastStatus)}
            <strong>${s.projectId}</strong>
            <span class="suite-path" style="margin:0;">${s.filePath}</span>
          </div>
          <div class="action-row" onclick="event.stopPropagation()">
            ${compactMixHtml(s.caseBreakdown)}
            <span class="muted">${fmtCaseCount(s.testCases.length)} · ${fmtDuration(s.lastDurationMs)}</span>
            <button class="btn btn-sm btn-primary" onclick="window.__runSuite('${s.layer}','${s.filePath}','${s.projectId}')">${runBtnLabel(s.layer)}</button>
            <button class="btn btn-sm btn-accent" onclick="window.__runInJenkins('${s.projectId}','${s.layer}')">Jenkins</button>
            <button class="btn btn-sm btn-secondary" onclick="window.__viewSource('${s.id}')">Code</button>
          </div>
        </div>
        ${isOpen ? `<div class="suite-cases-drawer">${renderCaseItems(s.testCases)}</div>` : ''}
      </div>`;
    })
    .join('');
}

function renderRunDetail(run) {
  document.getElementById('run-detail-title').textContent = `${run.projectId || 'all'} · ${run.layer}`;
  const cancelBtn = document.getElementById('btn-cancel-run');
  cancelBtn.classList.toggle('hidden', run.status !== 'running');
  cancelBtn.onclick = async () => {
    await api(`/api/runs/${run.id}/cancel`, { method: 'POST' });
    showToast('Run cancelled');
    await refreshAll();
  };

  const jsonBtn = document.getElementById('btn-export-json');
  const csvBtn = document.getElementById('btn-export-csv');
  const htmlBtn = document.getElementById('btn-export-html');
  [jsonBtn, csvBtn, htmlBtn].forEach((b) => b.classList.remove('hidden'));
  jsonBtn.href = `/api/runs/${run.id}/export?format=json`;
  csvBtn.href = `/api/runs/${run.id}/export?format=csv`;
  htmlBtn.href = `/api/runs/${run.id}/export?format=html`;

  const bt = run.summary.byType;
  const modeLabel =
    run.layer === 'frontend-e2e' || run.layer === 'all'
      ? ` · Mode: <strong>${run.headed ? `Headed (${run.browser || 'chrome'})` : 'Headless'}</strong>`
      : '';
  document.getElementById('run-detail-meta').innerHTML = `
    <p class="muted">
      ${badgeHtml(run.status)} ·
      Env: <strong>${run.environment || 'local'}</strong> ·
      Filter: <strong>${run.caseType || 'all'}</strong>${modeLabel} ·
      Passed: <strong>${run.summary.passed}/${run.summary.total}</strong> ·
      Duration: <strong>${fmtDuration(run.durationMs)}</strong>
    </p>
    ${bt ? breakdownHtml(bt) : ''}`;

  const casesEl = document.getElementById('run-detail-cases');
  if (!run.cases || run.cases.length === 0) {
    casesEl.innerHTML = '<p class="muted">No cases recorded yet.</p>';
  } else {
    casesEl.innerHTML = run.cases
      .map(
        (c) => `
        <div class="case-row">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <span>${badgeHtml(c.status)} ${badgeHtml(c.caseType)} <strong>${cleanCaseTitle(c.title)}</strong></span>
            <span class="muted">${fmtDuration(c.durationMs)}</span>
          </div>
          ${c.failureMessage ? `<div class="case-error">${c.failureMessage}</div>` : ''}
        </div>`
      )
      .join('');
  }

  const logBox = document.getElementById('run-detail-logs');
  logBox.textContent = (run.logs || []).join('\n') || 'No logs available.';
  logBox.scrollTop = logBox.scrollHeight;
}

function renderJenkinsBuildDetail(build) {
  document.getElementById('jk-build-title').textContent =
    `${build.jobName} #${build.buildNumber} (${build.mode})`;

  const linkedBtn = document.getElementById('btn-open-linked-run');
  linkedBtn.classList.toggle('hidden', !build.linkedRunId);
  linkedBtn.onclick = () => {
    if (build.linkedRunId) window.__inspectRun(build.linkedRunId);
  };

  document.getElementById('jk-stages-bar').innerHTML = (build.stages || [])
    .map(
      (st) => `
      <div class="stage-pill">
        ${badgeHtml(st.status)}
        <strong>${st.name}</strong>
        <span class="muted">${fmtDuration(st.durationMs)}</span>
      </div>`
    )
    .join('');

  const consoleBox = document.getElementById('jk-console-logs');
  consoleBox.textContent = (build.consoleLogs || []).join('\n') || 'No console output yet.';
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

async function selectRun(runId) {
  state.selectedRunId = runId;
  const run = await api(`/api/runs/${runId}`);
  renderRunDetail(run);
  renderRunsList(state.overview.recentRuns);
  if (run.status === 'running') startPollingRun(runId);
}

function renderRunsList(runs) {
  document.getElementById('runs-list').innerHTML = runs
    .map(
      (r) => `
      <div class="run-item ${state.selectedRunId === r.id ? 'selected' : ''}" onclick="window.__selectRun('${r.id}')">
        <div>
          <div style="font-weight:600;font-size:13px;">${r.projectId || 'all'} · ${r.layer} (${r.caseType || 'all'})</div>
          <div class="muted" style="font-size:11px;">${r.environment || 'local'} · ${r.triggeredBy} · ${fmtTime(r.startedAt)}</div>
        </div>
        <div style="text-align:right;">
          ${badgeHtml(r.status)}
          <div class="muted" style="font-size:11px;margin-top:4px;">${r.summary.passed}/${r.summary.total} · ${fmtDuration(r.durationMs)}</div>
        </div>
      </div>`
    )
    .join('');
}

async function refreshJenkins() {
  const data = await api('/api/jenkins/status');
  document.getElementById('jk-settings-mode').textContent = data.settings.mode;
  document.getElementById('jk-cfg-job').value = data.settings.defaultJob || 'sdet-test-framework';

  const listEl = document.getElementById('jenkins-builds-list');
  listEl.innerHTML = data.builds
    .map(
      (b) => `
      <div class="run-item ${state.selectedBuildId === b.id ? 'selected' : ''}" onclick="window.__selectBuild('${b.id}')">
        <div>
          <div style="font-weight:600;font-size:13px;">#${b.buildNumber} ${b.parameters.PROJECT} (${b.parameters.ENVIRONMENT})</div>
          <div class="muted" style="font-size:11px;">${b.parameters.TEST_LAYER} · ${b.parameters.CASE_TYPE || 'all'} · ${fmtTime(b.startedAt)}</div>
        </div>
        <div style="text-align:right;">
          ${badgeHtml(b.result)}
          <div class="muted" style="font-size:11px;margin-top:4px;">${fmtDuration(b.durationMs)}</div>
        </div>
      </div>`
    )
    .join('');

  const selected = data.builds.find((b) => b.id === state.selectedBuildId) || data.builds[0];
  if (selected) {
    state.selectedBuildId = selected.id;
    renderJenkinsBuildDetail(selected);
  }
}

function populateSelectors(projects, environments) {
  const projOpts = `<option value="all">All Projects</option>` +
    projects.map((p) => `<option value="${p.id}">${p.id}</option>`).join('');
  const envOpts = environments
    .map((e) => `<option value="${e.name}">${e.name}</option>`)
    .join('');

  const topProj = document.getElementById('select-project');
  const jkProj = document.getElementById('jk-project');
  const topEnv = document.getElementById('select-env');
  const jkEnv = document.getElementById('jk-env');

  topProj.innerHTML = projOpts;
  topProj.value = state.selectedProject;
  jkProj.innerHTML = projOpts;
  jkProj.value = state.selectedProject;

  topEnv.innerHTML = envOpts;
  topEnv.value = state.selectedEnv;
  jkEnv.innerHTML = envOpts;
  jkEnv.value = state.selectedEnv;
}

function renderSuitesTabs() {
  if (!state.overview) return;
  const suites = state.overview.suites || [];
  renderSuites(suites.filter((s) => s.layer !== 'frontend-e2e'), 'backend-suites-list', state.searchBackend);
  renderSuites(suites.filter((s) => s.layer === 'frontend-e2e'), 'frontend-suites-list', state.searchFrontend);
}

async function refreshAll() {
  const params = new URLSearchParams();
  if (state.selectedProject !== 'all') params.set('projectId', state.selectedProject);
  if (state.selectedCaseType !== 'all') params.set('caseType', state.selectedCaseType);
  const query = params.toString() ? `?${params.toString()}` : '';

  const data = await api(`/api/overview${query}`);
  state.overview = data;

  if (!state.selectedEnv) state.selectedEnv = data.config.environment || 'local';
  populateSelectors(data.projects || [], data.environments || []);

  const pill = document.getElementById('dummy-health-pill');
  pill.textContent = data.dummyAppHealth.reachable ? 'Dummy App: Online' : 'Dummy App: Auto';
  pill.className = `status-pill ${data.dummyAppHealth.reachable ? 'ok' : 'down'}`;
  document.getElementById('dummy-app-link').href = data.dummyAppHealth.url;

  const jkPill = document.getElementById('jenkins-mode-pill');
  jkPill.textContent = `Jenkins: ${data.jenkins.settings.mode}`;
  jkPill.className = 'status-pill ok';

  const cb = data.metrics.caseBreakdown || { positive: 0, negative: 0, edge: 0 };
  document.getElementById('kpi-total-projects').textContent = data.metrics.totalProjects;
  document.getElementById('kpi-active-env').textContent = `Env: ${state.selectedEnv}`;
  document.getElementById('kpi-total-cases').textContent = data.metrics.totalCases;
  document.getElementById('kpi-case-breakdown').textContent = `Pos ${cb.positive} · Neg ${cb.negative} · Edge ${cb.edge}`;
  document.getElementById('kpi-backend-rate').textContent =
    data.metrics.backendPassRate != null ? `${data.metrics.backendPassRate}%` : 'N/A';
  document.getElementById('kpi-backend-suites').textContent = `${data.metrics.backendSuites} suites`;
  document.getElementById('kpi-frontend-rate').textContent =
    data.metrics.frontendPassRate != null ? `${data.metrics.frontendPassRate}%` : 'N/A';
  document.getElementById('kpi-stability').textContent =
    data.metrics.flakyCount > 0 ? `Flaky cases: ${data.metrics.flakyCount}` : `${data.metrics.frontendSuites} specs · 0 flaky`;

  renderTrend(data.analytics);
  renderProjectsGrid(data.projects || [], data.suites || []);

  document.getElementById('overview-runs-body').innerHTML = data.recentRuns
    .slice(0, 8)
    .map(
      (r) => `
      <tr>
        <td><code>${r.id}</code></td>
        <td>${r.projectId || 'all'}</td>
        <td>${r.environment || 'local'}</td>
        <td>${r.layer}</td>
        <td>${r.caseType || 'all'}</td>
        <td>${badgeHtml(r.status)}</td>
        <td>${r.summary.passed}/${r.summary.total}</td>
        <td>${fmtDuration(r.durationMs)}</td>
        <td class="action-row">
          <button class="btn btn-sm btn-secondary" onclick="window.__inspectRun('${r.id}')">Inspect</button>
          <a class="btn btn-sm btn-secondary link-btn" href="/api/runs/${r.id}/export?format=csv">CSV</a>
          <a class="btn btn-sm btn-secondary link-btn" href="/api/runs/${r.id}/export?format=html">HTML</a>
        </td>
      </tr>`
    )
    .join('');

  renderSuitesTabs();
  renderRunsList(data.recentRuns);

  if (!state.selectedRunId && data.recentRuns.length > 0) {
    state.selectedRunId = data.recentRuns[0].id;
    renderRunDetail(data.recentRuns[0]);
  }
}

async function loadDummyData() {
  const [snapshot, overview] = await Promise.all([api('/api/dummy-data'), api('/api/overview')]);
  document.getElementById('dummy-reset-timestamp').textContent = `Reset: ${fmtTime(snapshot.lastResetAt)}`;

  document.getElementById('dummy-users-body').innerHTML = snapshot.users
    .map((u) => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td></tr>`)
    .join('');

  document.getElementById('dummy-products-body').innerHTML = snapshot.products
    .map((p) => `<tr><td>${p.id}</td><td>${p.sku}</td><td>${p.name}</td><td>$${p.price}</td><td>${p.stock}</td></tr>`)
    .join('');

  document.getElementById('dummy-orders-body').innerHTML = snapshot.orders
    .map((o) => `<tr><td>${o.id}</td><td>${o.userId}</td><td>${o.productId}</td><td>${o.quantity}</td><td>$${o.totalAmount}</td><td>${o.status}</td></tr>`)
    .join('');

  const envObj = (overview.environments || []).find((e) => e.name === state.selectedEnv) || overview.environments?.[0];
  const serviceRows = envObj
    ? Object.entries(envObj.services).map(([k, v]) => [`service.${k}`, v])
    : [];
  const rows = [
    ['TEST_ENV', state.selectedEnv],
    ['USE_DUMMY_APP', String(envObj ? envObj.useDummyApp : overview.config.useDummyApp)],
    ['OAUTH_TOKEN_URL', envObj ? envObj.oauth.tokenUrl : overview.config.oauth.tokenUrl],
    ...serviceRows,
  ];
  document.getElementById('env-config-box').innerHTML = rows
    .map(([k, v]) => `<div class="kv-row"><span class="kv-key">${k}</span><code>${v}</code></div>`)
    .join('');
}

async function loadAiDiagnostics() {
  const diag = await api('/api/agent/diagnostics');
  document.getElementById('ai-prompt-box').textContent = diag.promptSummary;
  document.getElementById('ai-mcp-box').textContent = JSON.stringify(diag.mcpConfig, null, 2);
}

window.__toggleSuite = (suiteId) => {
  if (state.expandedSuites.has(suiteId)) {
    state.expandedSuites.delete(suiteId);
  } else {
    state.expandedSuites.add(suiteId);
  }
  renderSuitesTabs();
};
window.__runSuite = (layer, filePath, projectId) => triggerRun(layer, filePath, projectId);
window.__runInJenkins = (projectId, testLayer) => triggerJenkinsPipeline({ projectId, testLayer });
window.__viewSource = (id) => viewSource(id);
window.__selectRun = (id) => selectRun(id);
window.__selectBuild = async (id) => {
  state.selectedBuildId = id;
  const build = await api(`/api/jenkins/builds/${id}`);
  renderJenkinsBuildDetail(build);
  await refreshJenkins();
};
window.__inspectRun = async (id) => {
  switchTab('runs');
  await selectRun(id);
};

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('[data-run-layer]').forEach((btn) => {
  btn.addEventListener('click', () => triggerRun(btn.dataset.runLayer));
});

document.querySelectorAll('[data-view-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.suiteViewMode = btn.dataset.viewMode;
    document.querySelectorAll('[data-view-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.viewMode === state.suiteViewMode);
    });
    renderSuitesTabs();
  });
});

document.querySelectorAll('[data-toggle-expand]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state.overview) return;
    const isBackend = btn.dataset.toggleExpand === 'backend';
    const targetSuites = (state.overview.suites || []).filter((s) =>
      isBackend ? s.layer !== 'frontend-e2e' : s.layer === 'frontend-e2e'
    );
    const allExpanded = targetSuites.every((s) => state.expandedSuites.has(s.id));
    for (const s of targetSuites) {
      if (allExpanded) state.expandedSuites.delete(s.id);
      else state.expandedSuites.add(s.id);
    }
    btn.textContent = allExpanded ? 'Expand All' : 'Collapse All';
    renderSuitesTabs();
  });
});

document.getElementById('search-backend').addEventListener('input', (e) => {
  state.searchBackend = e.target.value;
  renderSuitesTabs();
});

document.getElementById('search-frontend').addEventListener('input', (e) => {
  state.searchFrontend = e.target.value;
  renderSuitesTabs();
});

document.getElementById('select-cypress-mode').addEventListener('change', (e) => {
  const [mode, browser, keep] = String(e.target.value).split(':');
  state.cypressHeaded = mode === 'headed';
  state.cypressBrowser = browser || 'chrome';
  state.cypressKeepOpen = keep === 'keep';

  const runAllBtn = document.getElementById('btn-run-e2e-all');
  if (runAllBtn) {
    runAllBtn.textContent = state.cypressHeaded ? 'Run All (Headed)' : 'Run All E2E';
  }
  renderSuitesTabs();
});

document.getElementById('btn-cypress-open').addEventListener('click', async () => {
  try {
    const res = await api('/api/cypress/open', {
      method: 'POST',
      body: JSON.stringify({ environment: state.selectedEnv }),
    });
    showToast(res.message);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('select-project').addEventListener('change', (e) => {
  state.selectedProject = e.target.value;
  refreshAll();
});

document.getElementById('select-env').addEventListener('change', (e) => {
  state.selectedEnv = e.target.value;
  refreshAll();
  if (document.getElementById('tab-dummy-data').classList.contains('active')) {
    loadDummyData();
  }
});

document.getElementById('select-case-type').addEventListener('change', (e) => {
  state.selectedCaseType = e.target.value;
  document.getElementById('jk-case-type').value = state.selectedCaseType;
  refreshAll();
});

document.getElementById('btn-run-all').addEventListener('click', () => triggerRun('all'));
document.getElementById('btn-trigger-jenkins-top').addEventListener('click', () =>
  triggerJenkinsPipeline({
    projectId: state.selectedProject,
    environment: state.selectedEnv,
    testLayer: 'all',
    caseType: state.selectedCaseType,
  })
);
document.getElementById('btn-refresh-overview').addEventListener('click', refreshAll);

async function resetDummyHandler() {
  await api('/api/dummy-data/reset', { method: 'POST' });
  showToast('Dummy data reset');
  await loadDummyData();
}

document.getElementById('btn-reset-dummy').addEventListener('click', resetDummyHandler);
document.getElementById('btn-reset-dummy-2').addEventListener('click', resetDummyHandler);

document.getElementById('btn-seed-users').addEventListener('click', async () => {
  await api('/api/dummy-data/seed', { method: 'POST', body: JSON.stringify({ count: 3 }) });
  showToast('Seeded 3 dummy users');
  await loadDummyData();
});

document.getElementById('btn-env-health').addEventListener('click', async () => {
  const res = await api('/api/environments/health-check', {
    method: 'POST',
    body: JSON.stringify({ environment: state.selectedEnv }),
  });
  const box = document.getElementById('env-health-results');
  box.classList.remove('hidden');
  box.innerHTML = res.checks
    .map(
      (c) => `
      <div class="stage-pill">
        ${badgeHtml(c.ok ? 'passed' : 'failed')}
        <strong>${c.serviceId}</strong>
        <span class="muted">${c.ok ? `${c.latencyMs}ms` : 'unreachable'}</span>
      </div>`
    )
    .join('');
});

document.getElementById('btn-seed-runs').addEventListener('click', async () => {
  await api('/api/runs/reset-seed', { method: 'POST' });
  state.selectedRunId = null;
  showToast('Seed runs restored');
  await refreshAll();
});

document.getElementById('btn-jenkins-trigger').addEventListener('click', () => triggerJenkinsPipeline());
document.getElementById('btn-refresh-jenkins').addEventListener('click', refreshJenkins);
document.getElementById('btn-jenkins-test-conn').addEventListener('click', async () => {
  const res = await api('/api/jenkins/test-connection', { method: 'POST' });
  showToast(res.message);
});

document.getElementById('btn-jenkins-save-cfg').addEventListener('click', async () => {
  const url = document.getElementById('jk-cfg-url').value;
  const user = document.getElementById('jk-cfg-user').value;
  const apiToken = document.getElementById('jk-cfg-token').value;
  const defaultJob = document.getElementById('jk-cfg-job').value;
  await api('/api/jenkins/config', {
    method: 'POST',
    body: JSON.stringify({ url, user, apiToken, defaultJob, useMock: !url }),
  });
  showToast('Saved Jenkins settings');
  await refreshJenkins();
});

document.getElementById('btn-jenkins-use-sim').addEventListener('click', async () => {
  await api('/api/jenkins/config', {
    method: 'POST',
    body: JSON.stringify({ useMock: true, url: '' }),
  });
  document.getElementById('jk-cfg-url').value = '';
  showToast('Using Jenkins Simulator');
  await refreshJenkins();
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  document.getElementById('source-modal').classList.add('hidden');
});

document.getElementById('btn-copy-ai-prompt').addEventListener('click', async () => {
  const text = document.getElementById('ai-prompt-box').textContent;
  await navigator.clipboard.writeText(text);
  showToast('Copied diagnostics');
});

void refreshAll();
