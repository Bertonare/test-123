import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';
import config, {
  getSafeConfigSummary,
  listEnvironmentProfiles,
  loadEnvironmentProfile,
  loadProjectsRegistry,
} from '../config';
import { dummyDataStore } from '../fixtures/dummy-data';
import { TestCaseType, TestLayer, TestRunRecord } from '../types';
import { jenkinsClient } from './services/jenkinsClient';
import {
  formatRunAsCsv,
  formatRunAsHtml,
  formatRunHistoryAsCsv,
} from './services/reportExporter';
import { runStore } from './services/runStore';
import { discoverTestSuites } from './services/testDiscovery';
import { testRunnerService } from './services/testRunner';

async function checkDummyAppHealth(): Promise<{ reachable: boolean; url: string }> {
  const url = config.api.baseUrl;
  try {
    const res = await fetch(`${url}/api/health`);
    return { reachable: res.ok, url };
  } catch {
    return { reachable: false, url };
  }
}

async function fetchDummySnapshot() {
  try {
    const res = await fetch(`${config.api.baseUrl}/api/test-utils/snapshot`);
    if (res.ok) return await res.json();
  } catch {
    // Fallback to in-process store
  }
  return dummyDataStore.getSnapshot();
}

function computePassRate(runs: TestRunRecord[], layers: TestLayer[]): number | null {
  const matching = runs.filter(
    (r) =>
      (r.status === 'passed' || r.status === 'failed') &&
      (layers.includes(r.layer as TestLayer) || r.layer === 'all') &&
      r.summary.total > 0
  );
  if (matching.length === 0) return null;
  const latest = matching[0];
  return Math.round((latest.summary.passed / latest.summary.total) * 100);
}

export function createDashboardApp(): Express {
  const app = express();
  app.use(express.json());

  const publicDir = path.resolve(__dirname, 'public');
  app.use(express.static(publicDir));

  app.get('/api/overview', async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const caseType = typeof req.query.caseType === 'string'
      ? (req.query.caseType as TestCaseType | 'all')
      : 'all';
    const suites = discoverTestSuites({ projectId, caseType });
    const projects = loadProjectsRegistry();
    const environments = listEnvironmentProfiles();
    const runs = runStore.listRuns();
    const dummyAppHealth = await checkDummyAppHealth();

    const backendSuites = suites.filter((s) => s.layer !== 'frontend-e2e');
    const frontendSuites = suites.filter((s) => s.layer === 'frontend-e2e');
    const totalCases = suites.reduce((acc, s) => acc + s.testCases.length, 0);
    const caseBreakdown = suites.reduce(
      (acc, s) => ({
        positive: acc.positive + s.caseBreakdown.positive,
        negative: acc.negative + s.caseBreakdown.negative,
        edge: acc.edge + s.caseBreakdown.edge,
      }),
      { positive: 0, negative: 0, edge: 0 }
    );

    const backendPassRate = computePassRate(runs, ['backend-api', 'backend-integration']);
    const frontendPassRate = computePassRate(runs, ['frontend-e2e']);

    const finishedRuns = runs.filter((r) => r.status === 'passed' || r.status === 'failed');
    const passedRuns = finishedRuns.filter((r) => r.status === 'passed').length;
    const overallPassRate =
      finishedRuns.length > 0 ? Math.round((passedRuns / finishedRuns.length) * 100) : null;

    // Detect flaky test cases across recent finished runs
    const caseOutcomes = new Map<string, Set<string>>();
    for (const r of finishedRuns.slice(0, 20)) {
      for (const c of r.cases || []) {
        if (c.status !== 'passed' && c.status !== 'failed') continue;
        const set = caseOutcomes.get(c.fullName) || new Set<string>();
        set.add(c.status);
        caseOutcomes.set(c.fullName, set);
      }
    }
    const flakyCases = Array.from(caseOutcomes.entries())
      .filter(([, outcomes]) => outcomes.has('passed') && outcomes.has('failed'))
      .map(([fullName]) => fullName);

    const trend = finishedRuns
      .slice(0, 10)
      .reverse()
      .map((r) => ({
        id: r.id,
        layer: r.layer,
        status: r.status,
        durationMs: r.durationMs || 0,
        passRate:
          r.summary.total > 0 ? Math.round((r.summary.passed / r.summary.total) * 100) : 0,
      }));

    res.json({
      config: getSafeConfigSummary(),
      projects,
      environments,
      dummyAppHealth,
      jenkins: {
        settings: jenkinsClient.getSettingsSummary(),
        recentBuilds: jenkinsClient.listBuilds().slice(0, 10),
      },
      metrics: {
        totalProjects: projects.length,
        totalSuites: suites.length,
        backendSuites: backendSuites.length,
        frontendSuites: frontendSuites.length,
        totalCases,
        caseBreakdown,
        backendPassRate,
        frontendPassRate,
        overallPassRate,
        flakyCount: flakyCases.length,
        lastRunAt: runs[0]?.startedAt || null,
      },
      analytics: {
        flakyCases,
        trend,
      },
      suites,
      recentRuns: runs.slice(0, 20),
    });
  });

  app.get('/api/projects', (_req, res) => {
    res.json({ projects: loadProjectsRegistry() });
  });

  app.get('/api/environments', (_req, res) => {
    res.json({
      activeEnvironment: config.environment,
      environments: listEnvironmentProfiles(),
    });
  });

  app.get('/api/suites', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const layer = typeof req.query.layer === 'string' ? (req.query.layer as TestLayer) : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const caseType = typeof req.query.caseType === 'string'
      ? (req.query.caseType as TestCaseType | 'all')
      : undefined;
    res.json({ suites: discoverTestSuites({ projectId, layer, tag, caseType }) });
  });

  app.get('/api/suites/:id/source', (req, res) => {
    const suite = discoverTestSuites().find((s) => s.id === req.params.id);
    if (!suite) {
      res.status(404).json({ error: 'Suite not found' });
      return;
    }
    const absPath = path.resolve(process.cwd(), suite.filePath);
    if (!absPath.startsWith(process.cwd()) || !fs.existsSync(absPath)) {
      res.status(404).json({ error: 'Source file not found' });
      return;
    }
    res.json({
      filePath: suite.filePath,
      content: fs.readFileSync(absPath, 'utf8'),
    });
  });

  app.post('/api/environments/health-check', async (req, res) => {
    const envName = typeof req.body?.environment === 'string' ? req.body.environment : config.environment;
    let profile;
    try {
      profile = loadEnvironmentProfile(envName);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    const checks = await Promise.all(
      Object.entries(profile.services).map(async ([serviceId, baseUrl]) => {
        const started = Date.now();
        const healthPath = serviceId === 'web-portal' ? '/' : '/api/health';
        try {
          const r = await fetch(`${baseUrl}${healthPath}`, {
            signal: AbortSignal.timeout(2000),
          });
          return {
            serviceId,
            url: baseUrl,
            ok: r.ok,
            status: r.status,
            latencyMs: Date.now() - started,
          };
        } catch {
          return {
            serviceId,
            url: baseUrl,
            ok: false,
            status: 0,
            latencyMs: Date.now() - started,
          };
        }
      })
    );

    res.json({ environment: profile.name, checks });
  });

  app.get('/api/runs/export', (req, res) => {
    const format = String(req.query.format || 'json').toLowerCase();
    const runs = runStore.listRuns();

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="test-control-runs.csv"');
      res.send(formatRunHistoryAsCsv(runs));
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="test-control-runs.json"');
    res.send(JSON.stringify(runs, null, 2));
  });

  app.get('/api/runs', (_req, res) => {
    res.json({ runs: runStore.listRuns() });
  });

  app.get('/api/runs/:id/export', (req, res) => {
    const run = runStore.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${run.id}.csv"`);
      res.send(formatRunAsCsv(run));
      return;
    }

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${run.id}-report.html"`);
      res.send(formatRunAsHtml(run));
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${run.id}.json"`);
    res.send(JSON.stringify(run, null, 2));
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = runStore.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(run);
  });

  app.post('/api/runs', (req, res) => {
    const {
      projectId,
      environment,
      layer,
      caseType,
      headed,
      browser,
      keepOpen,
      targetFile,
      tags,
      triggeredBy,
    } = req.body || {};
    const validLayers = ['backend-api', 'backend-integration', 'frontend-e2e', 'all'];
    if (!validLayers.includes(layer)) {
      res.status(400).json({ error: `Invalid layer. Must be one of: ${validLayers.join(', ')}` });
      return;
    }

    const validCaseTypes = ['all', 'positive', 'negative', 'edge'];
    if (caseType && !validCaseTypes.includes(caseType)) {
      res.status(400).json({ error: `Invalid caseType. Must be one of: ${validCaseTypes.join(', ')}` });
      return;
    }

    const validBrowsers = ['electron', 'chrome'];
    if (browser && !validBrowsers.includes(browser)) {
      res.status(400).json({ error: `Invalid browser. Must be one of: ${validBrowsers.join(', ')}` });
      return;
    }

    if (environment) {
      try {
        loadEnvironmentProfile(String(environment));
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    if (targetFile) {
      const normalized = path.normalize(String(targetFile)).replace(/\\/g, '/');
      const allowed = discoverTestSuites().some((s) => s.filePath === normalized);
      if (!allowed) {
        res.status(400).json({ error: 'targetFile must match a discovered test suite path' });
        return;
      }
    }

    const run = testRunnerService.startRun({
      projectId: typeof projectId === 'string' ? projectId : undefined,
      environment: typeof environment === 'string' ? environment : undefined,
      layer,
      caseType: typeof caseType === 'string' ? (caseType as TestCaseType | 'all') : 'all',
      headed: Boolean(headed),
      browser: browser === 'chrome' || browser === 'electron' ? browser : undefined,
      keepOpen: Boolean(keepOpen),
      targetFile,
      tags: typeof tags === 'string' ? tags : undefined,
      triggeredBy: triggeredBy === 'ai-agent' ? 'ai-agent' : 'dashboard',
    });
    res.status(202).json(run);
  });

  app.post('/api/cypress/open', async (req, res) => {
    const envName = typeof req.body?.environment === 'string' ? req.body.environment : undefined;
    try {
      const result = await testRunnerService.openCypressInteractive(envName);
      res.status(result.launched ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ launched: false, message: (err as Error).message });
    }
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const cancelled = testRunnerService.cancelRun(req.params.id);
    if (!cancelled) {
      res.status(404).json({ error: 'Active run not found' });
      return;
    }
    res.json({ cancelled: true, id: req.params.id });
  });

  app.post('/api/runs/reset-seed', (_req, res) => {
    const runs = runStore.resetToSeed();
    res.json({ message: 'Seed run history restored', runs });
  });

  // --- Seamless Jenkins Integration Endpoints ---
  app.get('/api/jenkins/status', (_req, res) => {
    res.json({
      settings: jenkinsClient.getSettingsSummary(),
      builds: jenkinsClient.listBuilds(),
    });
  });

  app.post('/api/jenkins/config', (req, res) => {
    const summary = jenkinsClient.updateSettings(req.body || {});
    res.json({ settings: summary });
  });

  app.post('/api/jenkins/test-connection', async (_req, res) => {
    const result = await jenkinsClient.testConnection();
    res.json(result);
  });

  app.get('/api/jenkins/builds', (_req, res) => {
    res.json({ builds: jenkinsClient.listBuilds() });
  });

  app.get('/api/jenkins/builds/:id', async (req, res) => {
    let build = jenkinsClient.getBuild(req.params.id);
    if (!build) {
      res.status(404).json({ error: 'Jenkins build not found' });
      return;
    }
    if (build.mode === 'real' && (build.result === 'QUEUED' || build.result === 'BUILDING')) {
      build = (await jenkinsClient.syncRealBuild(build.id)) || build;
    }
    res.json(build);
  });

  app.post('/api/jenkins/trigger', async (req, res) => {
    const { projectId, environment, testLayer, caseType, tags, branch, jobName } = req.body || {};
    try {
      const build = await jenkinsClient.triggerBuild({
        projectId,
        environment,
        testLayer,
        caseType,
        tags,
        branch,
        jobName,
      });
      res.status(202).json(build);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // --- Dummy Data Endpoints ---
  app.get('/api/dummy-data', async (_req, res) => {
    const snapshot = await fetchDummySnapshot();
    res.json(snapshot);
  });

  app.post('/api/dummy-data/reset', async (_req, res) => {
    try {
      const r = await fetch(`${config.api.baseUrl}/api/test-utils/reset`, { method: 'POST' });
      if (r.ok) {
        res.json(await r.json());
        return;
      }
    } catch {
      // Fallback to local store
    }
    const snapshot = dummyDataStore.reset();
    res.json({ message: 'Dummy data reset to initial seed state', snapshot });
  });

  app.post('/api/dummy-data/seed', async (req, res) => {
    const count = Number(req.body?.count) || 3;
    try {
      const r = await fetch(`${config.api.baseUrl}/api/test-utils/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      if (r.ok) {
        res.status(201).json(await r.json());
        return;
      }
    } catch {
      // Fallback to local store
    }
    const created = dummyDataStore.seedAdditionalDummyUsers(count);
    res.status(201).json({ created, snapshot: dummyDataStore.getSnapshot() });
  });

  app.get('/api/agent/diagnostics', async (_req, res) => {
    const suites = discoverTestSuites();
    const projects = loadProjectsRegistry();
    const runs = runStore.listRuns();
    const latestRun = runs[0] || null;
    const latestBuild = jenkinsClient.listBuilds()[0] || null;
    const failedCases = runs
      .slice(0, 5)
      .flatMap((r) =>
        r.cases
          .filter((c) => c.status === 'failed')
          .map((c) => ({ runId: r.id, projectId: r.projectId, layer: r.layer, ...c }))
      );

    const mcpConfigPath = path.resolve(process.cwd(), '.mcp.json');
    const mcpConfig = fs.existsSync(mcpConfigPath)
      ? JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'))
      : null;

    const promptSummary = [
      `# SDET Multi-Service Test Framework Diagnostics`,
      `Active Environment: ${config.environment} (${config.environmentLabel})`,
      `Projects Registered: ${projects.map((p) => p.id).join(', ')}`,
      `Discovered Suites: ${suites.length} (${suites.filter((s) => s.layer !== 'frontend-e2e').length} backend, ${suites.filter((s) => s.layer === 'frontend-e2e').length} frontend)`,
      latestRun
        ? `Latest Test Run: ${latestRun.id} [${latestRun.projectId || 'all'} / ${latestRun.layer}] -> ${latestRun.status.toUpperCase()} (${latestRun.summary.passed}/${latestRun.summary.total} passed)`
        : 'Latest Test Run: none recorded',
      latestBuild
        ? `Latest Jenkins Build: #${latestBuild.buildNumber} (${latestBuild.jobName}) -> ${latestBuild.result}`
        : 'Latest Jenkins Build: none recorded',
      failedCases.length > 0
        ? `Recent Failures:\n${failedCases.map((f) => `- [${f.projectId || 'all'} / ${f.layer}] ${f.fullName}: ${f.failureMessage || 'Unknown error'}`).join('\n')}`
        : 'Recent Failures: None (all recent runs healthy).',
    ].join('\n');

    res.json({
      config: getSafeConfigSummary(),
      mcpConfig,
      projectsCount: projects.length,
      suitesCount: suites.length,
      latestRun,
      latestBuild,
      failedCases,
      promptSummary,
    });
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
