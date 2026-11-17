import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import config, { loadEnvironmentProfile, loadProjectsRegistry } from '../../config';
import { createDummyApp } from '../../dummy-app/server';
import { classifyTestCaseType, computeCaseBreakdown } from '../../fixtures/seed-runs';
import { TestCaseResult, TestCaseType, TestLayer, TestRunRecord } from '../../types';
import { runStore } from './runStore';
import { discoverTestSuites } from './testDiscovery';

interface ActiveJob {
  process?: ChildProcess;
  cancelled: boolean;
}

const activeJobs = new Map<string, ActiveJob>();

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDummyServerIfNeeded(
  useDummy: boolean,
  logs: string[]
): Promise<() => Promise<void>> {
  if (!useDummy) {
    return async () => {};
  }

  const healthUrl = `http://127.0.0.1:${config.ports.dummyApp}/api/health`;
  const alreadyUp = await isUrlReachable(healthUrl);
  if (alreadyUp) {
    logs.push(`[runner] Using running Dummy Target App on port ${config.ports.dummyApp}`);
    return async () => {};
  }

  const app = createDummyApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(config.ports.dummyApp, '127.0.0.1', () => resolve());
  });
  logs.push(`[runner] Auto-started Dummy Target App on http://127.0.0.1:${config.ports.dummyApp}`);

  return async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    logs.push('[runner] Stopped ephemeral Dummy Target App');
  };
}

function runSubprocess(
  runId: string,
  command: string,
  args: string[],
  envOverrides: NodeJS.ProcessEnv,
  onLog: (line: string) => void
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      shell: false,
    });

    const job = activeJobs.get(runId);
    if (job) {
      job.process = child;
    }

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          onLog(line);
        }
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      onLog(`[error] Failed to spawn ${command}: ${err.message}`);
      resolve(1);
    });
  });
}

async function executeJestLayer(
  runId: string,
  layer: 'backend-api' | 'backend-integration',
  projectId: string | undefined,
  environment: string,
  targetFile: string | undefined,
  tags: string | undefined,
  caseType: TestCaseType | 'all' | undefined,
  onLog: (line: string) => void
): Promise<{ cases: TestCaseResult[]; exitCode: number }> {
  const reportDir = path.resolve(process.cwd(), 'reports/raw');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonOutputPath = path.join(reportDir, `${runId}-${layer}.json`);

  const projectDef = projectId
    ? loadProjectsRegistry().find((p) => p.id === projectId)
    : undefined;

  const args = [
    '--config',
    'jest.config.ts',
    '--runInBand',
    '--coverage=false',
    '--json',
    '--outputFile',
    jsonOutputPath,
  ];

  if (targetFile) {
    args.push(targetFile);
  } else {
    const layerPattern =
      layer === 'backend-api' ? '\\.api\\.spec\\.ts$' : '\\.integration\\.spec\\.ts$';
    const combinedPattern =
      projectDef && projectDef.type !== 'frontend'
        ? `${projectDef.testRoot}/.*${layerPattern}`
        : layerPattern;
    args.push('--testPathPattern', combinedPattern);
  }

  const nameFilters: string[] = [];
  if (caseType && caseType !== 'all') {
    nameFilters.push(`\\[${caseType}\\]`);
  }
  if (tags && tags.trim()) {
    const tagRegex = tags
      .split(',')
      .map((t) => `@${t.trim().replace(/^@/, '')}`)
      .filter(Boolean)
      .join('|');
    if (tagRegex) nameFilters.push(`(${tagRegex})`);
  }
  if (nameFilters.length > 0) {
    args.push('-t', nameFilters.join('.*'));
  }

  const jestBin = path.resolve(
    process.cwd(),
    process.platform === 'win32' ? 'node_modules/.bin/jest.cmd' : 'node_modules/.bin/jest'
  );

  onLog(`[jest] Running ${layer} (project=${projectId || 'all'}, env=${environment}, caseType=${caseType || 'all'})`);
  const exitCode = await runSubprocess(
    runId,
    jestBin,
    args,
    { TEST_ENV: environment },
    onLog
  );

  const cases: TestCaseResult[] = [];
  if (fs.existsSync(jsonOutputPath)) {
    try {
      const jestJson = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
      for (const suiteResult of jestJson.testResults || []) {
        for (const assertion of suiteResult.assertionResults || []) {
          cases.push({
            suite: (assertion.ancestorTitles || []).join(' > ') || path.basename(suiteResult.name),
            title: assertion.title,
            fullName: assertion.fullName || assertion.title,
            caseType: classifyTestCaseType(assertion.title),
            status:
              assertion.status === 'passed'
                ? 'passed'
                : assertion.status === 'failed'
                  ? 'failed'
                  : 'skipped',
            durationMs: assertion.duration || 0,
            failureMessage:
              assertion.failureMessages && assertion.failureMessages.length > 0
                ? assertion.failureMessages.join('\n')
                : undefined,
          });
        }
      }
    } catch (err) {
      onLog(`[warn] Unable to parse Jest JSON output: ${(err as Error).message}`);
    }
  }

  return { cases, exitCode };
}

async function executeCypressLayer(
  runId: string,
  projectId: string | undefined,
  environment: string,
  targetFile: string | undefined,
  tags: string | undefined,
  caseType: TestCaseType | 'all' | undefined,
  headed: boolean,
  browser: 'electron' | 'chrome',
  keepOpen: boolean,
  onLog: (line: string) => void
): Promise<{ cases: TestCaseResult[]; exitCode: number }> {
  const reportDir = path.resolve(process.cwd(), 'reports/raw');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonOutputPath = path.join(reportDir, `${runId}-cypress.json`);
  if (fs.existsSync(jsonOutputPath)) {
    fs.unlinkSync(jsonOutputPath);
  }

  const envProfile = loadEnvironmentProfile(environment);
  const cypressBaseUrl =
    process.env.CYPRESS_BASE_URL ||
    envProfile.services['web-portal'] ||
    config.cypress.baseUrl;

  const cypressBin = path.resolve(
    process.cwd(),
    process.platform === 'win32' ? 'node_modules/.bin/cypress.cmd' : 'node_modules/.bin/cypress'
  );

  const hasDisplay =
    process.platform === 'win32' ||
    process.platform === 'darwin' ||
    Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

  let effectiveHeaded = headed;
  if (headed && !hasDisplay) {
    onLog('[warn] No DISPLAY/WAYLAND_DISPLAY detected for headed mode; falling back to headless.');
    effectiveHeaded = false;
  }

  const args = ['run', effectiveHeaded ? '--headed' : '--headless', '--browser', browser];
  if (effectiveHeaded && keepOpen) {
    args.push('--no-exit');
  }

  const projectDef = projectId
    ? loadProjectsRegistry().find((p) => p.id === projectId && p.type === 'frontend')
    : undefined;

  if (targetFile) {
    args.push('--spec', targetFile);
  } else if (tags && tags.trim()) {
    const tagList = tags.split(',').map((t) => t.trim().replace(/^@/, '')).filter(Boolean);
    const matchedSpecs = discoverTestSuites({ projectId, layer: 'frontend-e2e' })
      .filter((s) => tagList.some((tag) => s.tags.includes(tag)))
      .map((s) => s.filePath);
    if (matchedSpecs.length === 0) {
      onLog(`[cypress] No E2E specs matched tags [${tags}]; skipping Cypress run.`);
      return { cases: [], exitCode: 0 };
    }
    args.push('--spec', matchedSpecs.join(','));
  } else if (projectDef) {
    args.push('--spec', `${projectDef.testRoot}/**/*.cy.ts`);
  }

  onLog(
    `[cypress] Running frontend E2E (mode=${effectiveHeaded ? 'headed' : 'headless'}, browser=${browser}, env=${environment}, caseType=${caseType || 'all'}, baseUrl=${cypressBaseUrl})`
  );
  const exitCode = await runSubprocess(
    runId,
    cypressBin,
    args,
    {
      TEST_ENV: environment,
      CYPRESS_BASE_URL: cypressBaseUrl,
      CYPRESS_caseType: caseType || 'all',
      CYPRESS_JSON_OUTPUT: jsonOutputPath,
      NO_COLOR: '1',
    },
    onLog
  );

  let cases: TestCaseResult[] = [];
  if (fs.existsSync(jsonOutputPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
      if (Array.isArray(parsed.cases)) {
        cases = parsed.cases.map((c: TestCaseResult) => ({
          ...c,
          caseType: c.caseType || classifyTestCaseType(c.title),
        }));
      }
    } catch (err) {
      onLog(`[warn] Unable to parse Cypress JSON output: ${(err as Error).message}`);
    }
  }

  return { cases, exitCode };
}

export class TestRunnerService {
  async openCypressInteractive(environment?: string): Promise<{ launched: boolean; message: string }> {
    const envName = environment || config.environment;
    const envProfile = loadEnvironmentProfile(envName);
    const hasDisplay =
      process.platform === 'win32' ||
      process.platform === 'darwin' ||
      Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

    if (!hasDisplay) {
      return {
        launched: false,
        message: 'No graphical DISPLAY/WAYLAND_DISPLAY available to open Cypress UI.',
      };
    }

    if (envProfile.useDummyApp) {
      await ensureDummyServerIfNeeded(true, []);
    }

    const cypressBaseUrl =
      process.env.CYPRESS_BASE_URL || envProfile.services['web-portal'] || config.cypress.baseUrl;
    const cypressBin = path.resolve(
      process.cwd(),
      process.platform === 'win32' ? 'node_modules/.bin/cypress.cmd' : 'node_modules/.bin/cypress'
    );

    const child = spawn(cypressBin, ['open', '--e2e'], {
      cwd: process.cwd(),
      env: { ...process.env, TEST_ENV: envName, CYPRESS_BASE_URL: cypressBaseUrl },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return {
      launched: true,
      message: `Launched Cypress interactive runner against ${cypressBaseUrl} (env=${envName}).`,
    };
  }

  startRun(params: {
    projectId?: string;
    environment?: string;
    layer: TestLayer | 'all';
    caseType?: TestCaseType | 'all';
    headed?: boolean;
    browser?: 'electron' | 'chrome';
    keepOpen?: boolean;
    targetFile?: string;
    tags?: string;
    triggeredBy?: TestRunRecord['triggeredBy'];
  }): TestRunRecord {
    const environment = params.environment || config.environment;
    const caseType = params.caseType || 'all';
    const headed = Boolean(params.headed);
    const browser = params.browser || (headed ? 'chrome' : 'electron');
    const keepOpen = Boolean(params.keepOpen);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: TestRunRecord = {
      id: runId,
      projectId: params.projectId || 'all',
      environment,
      layer: params.layer,
      caseType,
      headed,
      browser,
      keepOpen,
      targetFile: params.targetFile,
      triggeredBy: params.triggeredBy || 'dashboard',
      status: 'running',
      startedAt: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        byType: { positive: 0, negative: 0, edge: 0 },
      },
      cases: [],
      logs: [
        `[runner] Starting ${params.layer} run (${runId}) [project=${params.projectId || 'all'}, env=${environment}, caseType=${caseType}${headed ? `, headed=${browser}` : ''}${params.tags ? `, tags=${params.tags}` : ''}]...`,
      ],
    };

    runStore.upsertRun(record);
    activeJobs.set(runId, { cancelled: false });

    void this.executeRun(
      runId,
      params.projectId,
      environment,
      params.layer,
      caseType,
      headed,
      browser,
      keepOpen,
      params.targetFile,
      params.tags
    );
    return record;
  }

  async runAndWait(params: {
    projectId?: string;
    environment?: string;
    layer: TestLayer | 'all';
    caseType?: TestCaseType | 'all';
    headed?: boolean;
    browser?: 'electron' | 'chrome';
    keepOpen?: boolean;
    targetFile?: string;
    tags?: string;
    triggeredBy?: TestRunRecord['triggeredBy'];
  }): Promise<TestRunRecord> {
    const run = this.startRun(params);
    while (true) {
      const latest = runStore.getRun(run.id);
      if (latest && latest.status !== 'running' && latest.status !== 'queued') {
        return latest;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  cancelRun(runId: string): boolean {
    const job = activeJobs.get(runId);
    if (!job) return false;
    job.cancelled = true;
    if (job.process && !job.process.killed) {
      job.process.kill('SIGTERM');
    }
    const existing = runStore.getRun(runId);
    if (existing) {
      existing.status = 'cancelled';
      existing.finishedAt = new Date().toISOString();
      existing.logs.push('[runner] Run cancelled by user.');
      runStore.upsertRun(existing);
    }
    return true;
  }

  private resolveLayersToRun(
    projectId: string | undefined,
    layer: TestLayer | 'all'
  ): TestLayer[] {
    if (layer !== 'all') return [layer];
    if (!projectId || projectId === 'all') {
      return ['backend-api', 'backend-integration', 'frontend-e2e'];
    }
    const projectDef = loadProjectsRegistry().find((p) => p.id === projectId);
    if (!projectDef) return ['backend-api', 'backend-integration', 'frontend-e2e'];
    return [projectDef.defaultLayer];
  }

  private async executeRun(
    runId: string,
    projectId: string | undefined,
    environment: string,
    layer: TestLayer | 'all',
    caseType: TestCaseType | 'all',
    headed: boolean,
    browser: 'electron' | 'chrome',
    keepOpen: boolean,
    targetFile?: string,
    tags?: string
  ): Promise<void> {
    const startMs = Date.now();
    const record = runStore.getRun(runId)!;
    let stopDummyServer: (() => Promise<void>) | undefined;

    const appendLog = (line: string) => {
      record.logs.push(line);
      if (record.logs.length > 500) {
        record.logs = record.logs.slice(-500);
      }
      runStore.upsertRun(record);
    };

    try {
      const envProfile = loadEnvironmentProfile(environment);
      const layersToRun = this.resolveLayersToRun(projectId, layer);

      if (layersToRun.includes('frontend-e2e')) {
        stopDummyServer = await ensureDummyServerIfNeeded(envProfile.useDummyApp, record.logs);
        runStore.upsertRun(record);
      }

      const allCases: TestCaseResult[] = [];
      let overallExit = 0;

      for (const currentLayer of layersToRun) {
        const job = activeJobs.get(runId);
        if (job?.cancelled) break;

        if (currentLayer === 'backend-api' || currentLayer === 'backend-integration') {
          const res = await executeJestLayer(
            runId,
            currentLayer,
            projectId,
            environment,
            targetFile,
            tags,
            caseType,
            appendLog
          );
          allCases.push(...res.cases);
          if (res.exitCode !== 0) overallExit = res.exitCode;
        } else if (currentLayer === 'frontend-e2e') {
          const res = await executeCypressLayer(
            runId,
            projectId,
            environment,
            targetFile,
            tags,
            caseType,
            headed,
            browser,
            keepOpen,
            appendLog
          );
          allCases.push(...res.cases);
          if (res.exitCode !== 0) overallExit = res.exitCode;
        }
      }

      const job = activeJobs.get(runId);
      if (!job?.cancelled) {
        const passed = allCases.filter((c) => c.status === 'passed').length;
        const failed = allCases.filter((c) => c.status === 'failed').length;
        const skipped = allCases.filter((c) => c.status === 'skipped').length;

        record.cases = allCases;
        record.summary = {
          total: allCases.length,
          passed,
          failed,
          skipped,
          byType: computeCaseBreakdown(allCases),
        };
        record.exitCode = overallExit;
        record.status = overallExit === 0 && failed === 0 ? 'passed' : 'failed';
        record.finishedAt = new Date().toISOString();
        record.durationMs = Date.now() - startMs;
        record.logs.push(
          `[runner] Finished with status=${record.status} (${passed}/${allCases.length} passed, ${failed} failed) in ${record.durationMs}ms`
        );
        runStore.upsertRun(record);
      }
    } catch (err) {
      record.status = 'failed';
      record.finishedAt = new Date().toISOString();
      record.durationMs = Date.now() - startMs;
      record.logs.push(`[error] Unexpected runner failure: ${(err as Error).message}`);
      runStore.upsertRun(record);
    } finally {
      if (stopDummyServer) {
        await stopDummyServer();
      }
      activeJobs.delete(runId);
    }
  }
}

export const testRunnerService = new TestRunnerService();
